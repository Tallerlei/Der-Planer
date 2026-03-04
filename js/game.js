'use strict';
/* ============================================================
   DER PLANER: RELOADED – Game Engine
   ============================================================ */

// ── Helpers ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = {
  money:   n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n),
  moneyDec: n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n),
  num:     n => new Intl.NumberFormat('de-DE').format(Math.round(n)),
  date:    (d, m, y) => `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`,
  pct:     n => `${Math.round(n)} %`,
  km:      n => `${fmt.num(n)} km`,
  weight:  n => n >= 1000 ? `${(n/1000).toFixed(1)} t` : `${n} kg`,
};

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max) { return Math.random() * (max - min) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid() { return '_' + Math.random().toString(36).slice(2, 9); }

// ── Game State ───────────────────────────────────────────────
const GS = {
  started: false,
  paused: false,
  speed: 1,        // ticks per real second (1/5/30)
  tickMs: 1000,    // real ms per tick (adjusted by speed)

  company: { name: 'Meine Spedition', mode: 'story', difficulty: 'normal' },

  time: { day: 1, month: 3, year: 1994, hour: 8, minute: 0, totalMinutes: 0 },

  finance: {
    balance: 50000,
    monthRevenue: 0,
    monthExpenses: 0,
    transactions: [],
  },

  vehicles: [],   // Vehicle objects
  staff:    [],   // Staff objects
  orders: {
    available: [],  // Not yet accepted
    active:    [],  // Accepted + in progress
    completed: [],  // Done
    declined:  [],  // Rejected
  },

  market: {
    fuelPrice: 1.65,
    orderValueMod: 1.0,
    orderVolumeMod: 1.0,
    speedMod: 1.0,
    activeEvents: [],
  },

  stats: {
    totalRevenue: 0,
    totalExpenses: 0,
    ordersCompleted: 0,
    ordersFailed: 0,
    kmDriven: 0,
  },

  // UI state
  ui: {
    currentScreen: 'menu',
    orderTab: 'available',
    routeVehicleId: null,
    routeStops: [],          // { cityId, action, orderRef }
    mapHighlight: null,
    lastOrderCheckMin: 0,
    lastEventCheckMin: 0,
    lastSalaryDay: 1,
  },

  // Notifications queue
  notifications: [],

  // Pending press conference event
  pressConference: null,

  // Pool of hire candidates
  hireCandidates: [],
};

// ── City lookup ──────────────────────────────────────────────
const cityById = {};
DATA.CITIES.forEach(c => { cityById[c.id] = c; });

function getCityName(id) { return cityById[id] ? cityById[id].name : id; }

// ── Distance calculation ─────────────────────────────────────
const distCache = {};
function getDistance(a, b) {
  if (a === b) return 0;
  const key = [a, b].sort().join('|');
  if (distCache[key]) return distCache[key];
  // Search connection table
  for (const [c1, c2, d] of DATA.CONNECTIONS) {
    if ((c1 === a && c2 === b) || (c1 === b && c2 === a)) {
      distCache[key] = d;
      return d;
    }
  }
  // Fallback: pixel distance * scale factor
  const ca = cityById[a], cb = cityById[b];
  if (!ca || !cb) return 500;
  const px = Math.sqrt(Math.pow(ca.x - cb.x, 2) + Math.pow(ca.y - cb.y, 2));
  const dist = Math.round(px * 1.4);   // rough km calibration
  distCache[key] = dist;
  return dist;
}

function routeDistance(stops) {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    total += getDistance(stops[i-1].cityId, stops[i].cityId);
  }
  return total;
}

// ── Vehicle factory ──────────────────────────────────────────
function createVehicle(catalogId, homeCityId) {
  const cat = DATA.VEHICLES.find(v => v.id === catalogId);
  if (!cat) return null;
  const num = GS.vehicles.filter(v => v.catalogId === catalogId).length + 1;
  return {
    id: uid(),
    catalogId,
    name: `${cat.name} #${num}`,
    health: 100,
    fuel: cat.fuelCapacity,
    odometer: 0,
    driverId: null,
    status: 'idle',    // idle | driving | maintenance | broken
    homeCity: homeCityId || 'frankfurt',
    currentCity: homeCityId || 'frankfurt',
    route: {
      stops: [],
      currentStopIndex: 0,
      progressPct: 0,   // 0-100 within current leg
      totalDistance: 0,
      coveredDistance: 0,
    },
    position: { x: 0, y: 0 },
  };
}

// ── Staff factory ────────────────────────────────────────────
function randomName(role) {
  const isMale = Math.random() > 0.45;
  const first = isMale
    ? pick(DATA.FIRST_NAMES_M)
    : pick(DATA.FIRST_NAMES_F);
  const last = pick(DATA.LAST_NAMES);
  return `${first} ${last}`;
}

function createStaff(role, skill) {
  const roleInfo = DATA.STAFF_ROLES[role];
  skill = skill || rand(1, 4);
  const salaryVariance = (skill - 2) * 200;
  const certs = [];
  if (role === 'driver') {
    certs.push('CE');
    if (Math.random() < 0.3) certs.push('ADR');
  }
  return {
    id: uid(),
    name: randomName(role),
    role,
    skill,
    salary: roleInfo.baseSalary + salaryVariance,
    satisfaction: rand(65, 90),
    certifications: certs,
    vehicleId: null,
    hiredAt: { ...GS.time },
  };
}

// ── Finance helpers ──────────────────────────────────────────
function addTransaction(desc, amount) {
  GS.finance.balance += amount;
  if (amount > 0) {
    GS.finance.monthRevenue  += amount;
    GS.stats.totalRevenue    += amount;
  } else {
    GS.finance.monthExpenses += Math.abs(amount);
    GS.stats.totalExpenses   += Math.abs(amount);
  }
  GS.finance.transactions.unshift({
    id: uid(),
    desc,
    amount,
    date: fmt.date(GS.time.day, GS.time.month, GS.time.year),
    balance: GS.finance.balance,
  });
  if (GS.finance.transactions.length > 200) {
    GS.finance.transactions.length = 200;
  }
  updateStatusBar();
}

// ── Order generation ─────────────────────────────────────────
function generateOrders() {
  const diff = DATA.DIFFICULTY[GS.company.difficulty];
  const volMod = GS.market.orderVolumeMod * diff.orderFrequency;
  const count = Math.round(rand(1, 3) * volMod);

  for (let i = 0; i < count; i++) {
    const template = pick(DATA.ORDER_TEMPLATES);
    const client   = pick(DATA.CLIENTS);

    // Pick origin & destination from cities
    const origins  = DATA.CITIES.filter(c => c.country === 'DE');
    const originC  = pick(origins);
    let destC;
    do { destC = pick(DATA.CITIES); } while (destC.id === originC.id);

    const dist    = getDistance(originC.id, destC.id);
    const weight  = rand(template.minWeight, template.maxWeight);
    const valueMod = GS.market.orderValueMod * diff.orderFrequency;
    const baseVal = Math.round(template.baseValue * (dist / 300) * valueMod * randFloat(0.85, 1.15));

    const channels = ['phone', 'fax', 'online'];
    const channelWeights = [0.5, 0.25, 0.25];
    let channel = 'phone';
    const r = Math.random();
    if (r < channelWeights[0]) channel = 'phone';
    else if (r < channelWeights[0] + channelWeights[1]) channel = 'fax';
    else channel = 'online';

    const deadlineDays = rand(2, 5);

    const order = {
      id: uid(),
      clientId: client.id,
      clientName: client.name,
      industry: client.industry,
      origin: originC.id,
      destination: destC.id,
      cargoDesc: template.cargo,
      cargoType: template.type,
      weight,
      requirements: [...template.requirements],
      value: baseVal,
      penalty: Math.round(baseVal * 0.1 * DATA.DIFFICULTY[GS.company.difficulty].orderPenaltyMod),
      bonus: Math.round(baseVal * 0.08),
      deadlineDays,
      expiresInDays: rand(1, 2),
      receivedMinute: GS.time.totalMinutes,
      channel,
      status: 'available',
      vehicleId: null,
      acceptedMinute: null,
      completedMinute: null,
      finalValue: null,
    };
    GS.orders.available.push(order);
  }

  updateOrderBadge();
  if ($('order-list-available')) renderOrders();
}

// ── Order lifecycle ──────────────────────────────────────────
function acceptOrder(orderId, vehicleId) {
  const idx = GS.orders.available.findIndex(o => o.id === orderId);
  if (idx < 0) return;
  const order = GS.orders.available[idx];

  const vehicle = GS.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) { showToast('Kein Fahrzeug ausgewählt.', 'warning'); return; }
  if (vehicle.status !== 'idle') { showToast('Fahrzeug ist nicht verfügbar.', 'warning'); return; }
  if (!vehicle.driverId) { showToast('Dem Fahrzeug ist kein Fahrer zugewiesen.', 'warning'); return; }

  // Check requirements
  const cat = DATA.VEHICLES.find(v => v.id === vehicle.catalogId);
  for (const req of order.requirements) {
    if (!cat.requirements.includes(req)) {
      const reqLabel = { cooling: 'Kühlung', adr: 'ADR-Zulassung', heavy_load: 'Schwerlastgenehmigung' }[req] || req;
      showToast(`Fahrzeug erfüllt nicht: ${reqLabel}`, 'danger'); return;
    }
  }

  GS.orders.available.splice(idx, 1);
  order.status = 'accepted';
  order.vehicleId = vehicleId;
  order.acceptedMinute = GS.time.totalMinutes;
  GS.orders.active.push(order);

  // Set up vehicle route: home → origin → destination → home
  vehicle.status = 'driving';
  vehicle.route = {
    stops: [
      { cityId: vehicle.currentCity, action: 'depart' },
      { cityId: order.origin,       action: 'pickup',   orderId: order.id },
      { cityId: order.destination,  action: 'delivery', orderId: order.id },
      { cityId: vehicle.homeCity,   action: 'return' },
    ],
    currentStopIndex: 0,
    progressPct: 0,
    totalDistance: 0,
    coveredDistance: 0,
  };

  // Remove degenerate stops (same city)
  vehicle.route.stops = vehicle.route.stops.filter((s, i, arr) =>
    i === 0 || s.cityId !== arr[i-1].cityId
  );

  vehicle.route.totalDistance = routeDistance(vehicle.route.stops);
  updatePositionForVehicle(vehicle);

  showToast(`Auftrag angenommen: ${order.clientName}`, 'success');
  updateOrderBadge();
  if ($('order-list-available')) renderOrders();
  if ($('fleet-list'))           renderFleet();
}

function declineOrder(orderId) {
  const idx = GS.orders.available.findIndex(o => o.id === orderId);
  if (idx < 0) return;
  const order = GS.orders.available.splice(idx, 1)[0];
  order.status = 'declined';
  GS.orders.declined.unshift(order);
  showToast('Auftrag abgelehnt.', 'warning');
  updateOrderBadge();
  if ($('order-list-available')) renderOrders();
}

function expireOrders() {
  const now = GS.time.totalMinutes;
  GS.orders.available = GS.orders.available.filter(order => {
    const ageMin = now - order.receivedMinute;
    if (ageMin > order.expiresInDays * 1440) {
      order.status = 'expired';
      GS.orders.declined.unshift(order);
      return false;
    }
    return true;
  });
  updateOrderBadge();
}

// ── Vehicle movement ─────────────────────────────────────────
function updatePositionForVehicle(v) {
  const stops = v.route.stops;
  if (!stops || stops.length === 0) return;
  const idx = v.route.currentStopIndex;
  if (idx >= stops.length - 1) {
    const c = cityById[stops[stops.length - 1].cityId];
    if (c) { v.position.x = c.x; v.position.y = c.y; }
    return;
  }
  const from = cityById[stops[idx].cityId];
  const to   = cityById[stops[idx + 1].cityId];
  if (!from || !to) return;
  const pct = v.route.progressPct / 100;
  v.position.x = from.x + (to.x - from.x) * pct;
  v.position.y = from.y + (to.y - from.y) * pct;
}

function tickVehicles(minutesPassed) {
  for (const v of GS.vehicles) {
    if (v.status !== 'driving') continue;
    const stops = v.route.stops;
    if (!stops || stops.length < 2) { v.status = 'idle'; continue; }

    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    const speedKmH = cat.speed * GS.market.speedMod;
    const kmPerMinute = speedKmH / 60;

    let remainingMinutes = minutesPassed;

    while (remainingMinutes > 0 && v.status === 'driving') {
      const idx  = v.route.currentStopIndex;
      const from = stops[idx];
      const to   = stops[idx + 1];
      if (!to) { arriveAtFinalStop(v); break; }

      const legDist = getDistance(from.cityId, to.cityId);
      const legKmDone = (v.route.progressPct / 100) * legDist;
      const legRemaining = legDist - legKmDone;
      const kmThisTick = kmPerMinute * remainingMinutes;

      // Fuel consumption
      const fuelUsed = (kmThisTick / 100) * cat.fuelConsumption;
      v.fuel = Math.max(0, v.fuel - fuelUsed);
      v.odometer += kmThisTick;
      GS.stats.kmDriven += kmThisTick;

      // Health degradation (per 10 000 km roughly 1 point)
      v.health = Math.max(0, v.health - kmThisTick * 0.0001);

      if (v.fuel <= 0) {
        v.status = 'broken';
        showToast(`${v.name} hat keinen Kraftstoff mehr!`, 'danger');
        break;
      }

      if (kmThisTick >= legRemaining) {
        // Arrive at next stop
        remainingMinutes -= (legRemaining / kmPerMinute);
        v.route.progressPct = 0;
        v.currentCity = to.cityId;
        v.route.coveredDistance += legDist;
        v.route.currentStopIndex++;

        // Process stop action
        processStopAction(v, to);

        if (v.route.currentStopIndex >= stops.length - 1) {
          arriveAtFinalStop(v);
          break;
        }
      } else {
        v.route.progressPct = ((legKmDone + kmThisTick) / legDist) * 100;
        remainingMinutes = 0;
      }
    }

    updatePositionForVehicle(v);
  }
}

function processStopAction(v, stop) {
  if (!stop.action || stop.action === 'depart' || stop.action === 'return') return;

  const order = GS.orders.active.find(o => o.id === stop.orderId);
  if (!order) return;

  if (stop.action === 'pickup') {
    showToast(`${v.name}: Ware abgeholt in ${getCityName(stop.cityId)}`, 'info');
  } else if (stop.action === 'delivery') {
    completeOrder(order, v);
  }
}

function completeOrder(order, vehicle) {
  const now = GS.time.totalMinutes;
  const idx = GS.orders.active.findIndex(o => o.id === order.id);
  if (idx < 0) return;

  const minutesTaken = now - order.acceptedMinute;
  const deadlineMin  = order.deadlineDays * 1440;
  let finalValue = order.value;

  if (minutesTaken <= deadlineMin) {
    finalValue += order.bonus;
    showToast(`✅ Lieferung abgeschlossen: +${fmt.money(finalValue)}`, 'success');
  } else {
    const hoursLate = Math.floor((minutesTaken - deadlineMin) / 60);
    const penalty = Math.min(order.value * 0.5, order.penalty * hoursLate);
    finalValue = Math.max(0, order.value - penalty);
    showToast(`⚠️ Lieferung verspätet: +${fmt.money(finalValue)} (Strafe: ${fmt.money(penalty)})`, 'warning');
  }

  order.status = 'completed';
  order.completedMinute = now;
  order.finalValue = finalValue;

  GS.orders.active.splice(idx, 1);
  GS.orders.completed.unshift(order);
  GS.stats.ordersCompleted++;

  addTransaction(`Lieferung: ${order.clientName} (${getCityName(order.origin)}→${getCityName(order.destination)})`, finalValue);

  // Reputation effect
  if (minutesTaken <= deadlineMin) GS.company.reputation = Math.min(100, (GS.company.reputation || 50) + 2);
  else GS.company.reputation = Math.max(0, (GS.company.reputation || 50) - 3);

  updateStatusBar();
}

function arriveAtFinalStop(v) {
  v.status = 'idle';
  v.route.stops = [];
  v.route.currentStopIndex = 0;
  v.route.progressPct = 0;

  // Refuel at home (simplified: instant refuel at cost)
  const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
  const litresNeeded = cat.fuelCapacity - v.fuel;
  if (litresNeeded > 0) {
    const cost = litresNeeded * GS.market.fuelPrice;
    addTransaction(`Kraftstoff ${v.name}`, -cost);
    v.fuel = cat.fuelCapacity;
  }
  if ($('fleet-list')) renderFleet();
}

// ── Market & events ──────────────────────────────────────────
function checkMarketEvents() {
  const diff = DATA.DIFFICULTY[GS.company.difficulty];
  for (const evt of DATA.MARKET_EVENTS) {
    if (Math.random() < evt.probability * diff.eventProbabilityMod / 30) {
      applyEvent(evt);
    }
  }

  // Expire old events
  GS.market.activeEvents = GS.market.activeEvents.filter(e => {
    e.remainingDays--;
    if (e.remainingDays <= 0) {
      revertEvent(e);
      return false;
    }
    return true;
  });
}

function applyEvent(evt) {
  // Prevent duplicate
  if (GS.market.activeEvents.some(e => e.id === evt.id)) return;

  const active = { id: evt.id, title: evt.title, remainingDays: evt.effect.duration };
  GS.market.activeEvents.push(active);

  if (evt.effect.fuelPriceMod)        GS.market.fuelPrice         += evt.effect.fuelPriceMod;
  if (evt.effect.orderValueMod)       GS.market.orderValueMod     += evt.effect.orderValueMod;
  if (evt.effect.orderVolumeMod)      GS.market.orderVolumeMod    += evt.effect.orderVolumeMod;
  if (evt.effect.speedMod)            GS.market.speedMod          = Math.max(0.3, GS.market.speedMod + evt.effect.speedMod);

  GS.market.fuelPrice = Math.max(0.80, GS.market.fuelPrice);

  showToast(`📰 ${evt.title}: ${evt.description}`, 'warning');
}

function revertEvent(active) {
  const evt = DATA.MARKET_EVENTS.find(e => e.id === active.id);
  if (!evt) return;
  if (evt.effect.fuelPriceMod)    GS.market.fuelPrice       -= evt.effect.fuelPriceMod;
  if (evt.effect.orderValueMod)   GS.market.orderValueMod   -= evt.effect.orderValueMod;
  if (evt.effect.orderVolumeMod)  GS.market.orderVolumeMod  -= evt.effect.orderVolumeMod;
  if (evt.effect.speedMod)        GS.market.speedMod         = Math.min(1, GS.market.speedMod - evt.effect.speedMod);
  GS.market.fuelPrice = Math.max(0.80, GS.market.fuelPrice);
}

// ── Monthly costs ────────────────────────────────────────────
function processMonthEnd() {
  // Salaries
  let totalSalary = 0;
  for (const s of GS.staff) {
    totalSalary += s.salary;
    s.satisfaction = Math.max(40, s.satisfaction - rand(0, 3));
  }
  if (totalSalary > 0) addTransaction('Gehälter Monat ' + GS.time.month, -totalSalary);

  // Vehicle maintenance
  let totalMaint = 0;
  for (const v of GS.vehicles) {
    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    const mechanic = GS.staff.find(s => s.role === 'mechanic');
    const discount = mechanic ? 0.15 * (mechanic.skill / 5) : 0;
    const cost = cat.maintenanceCostPerMonth * (1 - discount);
    totalMaint += cost;
    // Gradually restore health
    v.health = Math.min(100, v.health + 5);
  }
  if (totalMaint > 0) addTransaction('Fahrzeugwartung', -Math.round(totalMaint));

  // Reset monthly stats
  GS.finance.monthRevenue  = 0;
  GS.finance.monthExpenses = 0;

  if (GS.finance.balance < 0) {
    showToast('⚠️ Achtung: Ihr Kontostand ist negativ!', 'danger');
  }
}

// ── Game loop ────────────────────────────────────────────────
let loopInterval = null;
const MINUTES_PER_TICK = 30;  // Each tick = 30 game-minutes

function startLoop() {
  if (loopInterval) clearInterval(loopInterval);
  loopInterval = setInterval(gameTick, Math.round(1000 / GS.speed));
}

function gameTick() {
  if (GS.paused) return;

  // Advance time
  GS.time.totalMinutes += MINUTES_PER_TICK;
  GS.time.minute = (GS.time.minute + MINUTES_PER_TICK) % 60;
  if (GS.time.minute === 0) {
    GS.time.hour = (GS.time.hour + 1) % 24;
  }

  // Day rollover
  const minutesInDay = GS.time.totalMinutes % 1440;
  if (minutesInDay < MINUTES_PER_TICK) {
    GS.time.day++;
    const daysInMonth = [0,31,28,31,30,31,30,31,31,30,31,30,31];
    if (GS.time.day > daysInMonth[GS.time.month]) {
      GS.time.day = 1;
      GS.time.month++;
      if (GS.time.month > 12) { GS.time.month = 1; GS.time.year++; }
      processMonthEnd();
    }

    // Daily: expire old available orders
    expireOrders();
    // Daily save
    autoSave();
  }

  // Tick vehicles
  tickVehicles(MINUTES_PER_TICK);

  // Generate orders every 2-4 game hours
  if (GS.time.totalMinutes - GS.ui.lastOrderCheckMin >= rand(120, 240)) {
    GS.ui.lastOrderCheckMin = GS.time.totalMinutes;
    generateOrders();
  }

  // Market events once per day roughly
  if (GS.time.totalMinutes - GS.ui.lastEventCheckMin >= 1440) {
    GS.ui.lastEventCheckMin = GS.time.totalMinutes;
    checkMarketEvents();
  }

  updateStatusBar();

  // Refresh active screen
  const screen = GS.ui.currentScreen;
  if (screen === 'fleet')    renderFleet();
  if (screen === 'orders')   renderOrders();
  if (screen === 'map')      renderMapScreen();
  if (screen === 'finance')  renderFinance();
  if (screen === 'office')   renderOffice();
}

// ── Speed control ────────────────────────────────────────────
function setSpeed(s) {
  GS.speed = s;
  GS.paused = (s === 0);
  startLoop();
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.speed) === s);
  });
}

// ── Save / Load ──────────────────────────────────────────────
function autoSave() { try { localStorage.setItem('derplaner_save', JSON.stringify(GS)); } catch(e) {} }

function loadGame() {
  try {
    const raw = localStorage.getItem('derplaner_save');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    Object.assign(GS, saved);
    return true;
  } catch (e) { return false; }
}

function hasSave() { return !!localStorage.getItem('derplaner_save'); }
function deleteSave() { localStorage.removeItem('derplaner_save'); }

// ── Toast notifications ──────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div class="toast-message">${msg}</div>`;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 4000);
}

// ── Status bar ───────────────────────────────────────────────
function updateStatusBar() {
  if (!GS.started) return;
  const bar = $('status-bar');
  if (!bar) return;

  const badMoney = GS.finance.balance < 0;
  $('sb-money').textContent = fmt.money(GS.finance.balance);
  $('sb-money').className = 'value money' + (badMoney ? ' danger' : '');
  $('sb-reputation').textContent = GS.company.reputation + ' / 100';
  $('sb-date').textContent = fmt.date(GS.time.day, GS.time.month, GS.time.year)
    + ` ${String(GS.time.hour).padStart(2,'0')}:${String(GS.time.minute).padStart(2,'0')}`;
  $('sb-company').textContent = GS.company.name;
  $('sb-vehicles').textContent = `${GS.vehicles.filter(v => v.status === 'driving').length}/${GS.vehicles.length}`;
  $('sb-fuel').textContent = fmt.moneyDec(GS.market.fuelPrice) + '/L';
}

function updateOrderBadge() {
  const badge = $('badge-orders');
  if (!badge) return;
  const n = GS.orders.available.length;
  badge.textContent = n;
  badge.classList.toggle('visible', n > 0);
}

// ── Screen navigation ────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $('screen-' + name);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
  });

  GS.ui.currentScreen = name;

  // Render screen content
  switch(name) {
    case 'office':    renderOffice();    break;
    case 'fleet':     renderFleet();     break;
    case 'orders':    renderOrders();    break;
    case 'routes':    renderRoutePlanner(); break;
    case 'personnel': renderPersonnel(); break;
    case 'finance':   renderFinance();   break;
    case 'map':       renderMapScreen(); break;
  }
}

// ── GAME INIT ────────────────────────────────────────────────
function startNewGame() {
  const name  = $('company-name').value.trim() || 'Meine Spedition';
  const diff  = document.querySelector('.diff-option.selected')?.dataset.diff || 'normal';
  const mode  = document.querySelector('.mode-option.selected')?.dataset.mode || 'story';
  const diffConfig = DATA.DIFFICULTY[diff];

  GS.company.name       = name;
  GS.company.difficulty = diff;
  GS.company.mode       = mode;
  GS.company.reputation = 50;

  GS.finance.balance    = diffConfig.startMoney;
  GS.market.fuelPrice   = diffConfig.fuelPriceBase;
  GS.time               = { day: 1, month: 3, year: 1994, hour: 8, minute: 0, totalMinutes: 480 };

  GS.vehicles = [];
  GS.staff    = [];
  GS.orders   = { available: [], active: [], completed: [], declined: [] };
  GS.finance.transactions = [];
  GS.market.activeEvents  = [];
  GS.stats = { totalRevenue: 0, totalExpenses: 0, ordersCompleted: 0, ordersFailed: 0, kmDriven: 0 };

  // Starter equipment
  const starterVan = createVehicle('transit', 'frankfurt');
  GS.vehicles.push(starterVan);

  // Starter staff
  const driver1 = createStaff('driver', 2);
  driver1.vehicleId = starterVan.id;
  starterVan.driverId = driver1.id;
  GS.staff.push(driver1);

  const operator = createStaff('operator', 2);
  GS.staff.push(operator);

  // Hiring pool
  generateHireCandidates();

  // Initial orders
  generateOrders();

  GS.started = true;

  // Show game UI
  $('status-bar').classList.add('visible');
  $('sidebar').classList.add('visible');
  $('main-layout').style.display = 'flex';
  document.getElementById('screen-menu').classList.remove('active');

  startLoop();
  showScreen('office');
  showToast(`Willkommen, ${name}! Ihr Unternehmen startet heute.`, 'success');
  addTransaction('Startkapital', 0); // just to record starting state
}

function loadAndContinue() {
  if (!loadGame()) { showToast('Kein Spielstand gefunden.', 'danger'); return; }
  GS.started = true;
  $('status-bar').classList.add('visible');
  $('sidebar').classList.add('visible');
  $('main-layout').style.display = 'flex';
  document.getElementById('screen-menu').classList.remove('active');
  startLoop();
  showScreen('office');
  showToast('Spielstand geladen.', 'success');
}

// ── Hire candidate pool ──────────────────────────────────────
function generateHireCandidates() {
  GS.hireCandidates = [];
  const roles = Object.keys(DATA.STAFF_ROLES);
  for (let i = 0; i < 8; i++) {
    const role = pick(roles);
    GS.hireCandidates.push(createStaff(role, rand(1, 5)));
  }
}

// ─────────────────────────────────────────────────────────────
// SCREEN RENDERERS
// ─────────────────────────────────────────────────────────────

// ── Office screen ────────────────────────────────────────────
function renderOffice() {
  const el = $('office-rooms');
  if (!el) return;

  const pendingOrders = GS.orders.available.length;
  const activeVehicles = GS.vehicles.filter(v => v.status === 'driving').length;
  const brokenVehicles = GS.vehicles.filter(v => v.status === 'broken').length;
  const events = GS.market.activeEvents.length;

  const rooms = [
    { icon: '📞', name: 'Aufträge',         desc: `${pendingOrders} neue Aufträge`, screen: 'orders',    badge: pendingOrders || null },
    { icon: '🚛', name: 'Fuhrpark',          desc: `${GS.vehicles.length} Fahrzeuge`, screen: 'fleet',   badge: brokenVehicles || null },
    { icon: '🗺️', name: 'Routenplanung',    desc: 'Mehrpunkt-Routen',              screen: 'routes',    badge: null },
    { icon: '👥', name: 'Personal',          desc: `${GS.staff.length} Mitarbeiter`, screen: 'personnel', badge: null },
    { icon: '💰', name: 'Buchhaltung',       desc: fmt.money(GS.finance.balance),   screen: 'finance',   badge: null },
    { icon: '🗺️', name: 'Karte',            desc: `${activeVehicles} unterwegs`,   screen: 'map',       badge: null },
    { icon: '📰', name: 'Markt & Ereignisse', desc: `${events} aktive Ereignisse`,  screen: null, action: 'events', badge: events || null },
    { icon: '⚙️', name: 'Einstellungen',    desc: 'Speichern & Optionen',           screen: null, action: 'settings', badge: null },
    { icon: '📊', name: 'Statistiken',       desc: `${GS.stats.ordersCompleted} Aufträge`, screen: null, action: 'stats', badge: null },
  ];

  el.innerHTML = rooms.map(r => `
    <div class="office-room" onclick="${r.screen ? `showScreen('${r.screen}')` : `officeAction('${r.action}')`}">
      <span class="room-icon">${r.icon}</span>
      <span class="room-name">${r.name}</span>
      <span class="room-desc">${r.desc}</span>
      ${r.badge ? `<span class="room-badge">${r.badge}</span>` : ''}
    </div>
  `).join('');

  // Update header
  const dateEl = $('office-date');
  if (dateEl) dateEl.textContent = fmt.date(GS.time.day, GS.time.month, GS.time.year);
}

function officeAction(action) {
  if (action === 'events')   openEventsModal();
  if (action === 'settings') openSettingsModal();
  if (action === 'stats')    openStatsModal();
}

// ── Fleet screen ─────────────────────────────────────────────
function renderFleet() {
  const listEl = $('fleet-list');
  if (!listEl) return;

  if (GS.vehicles.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🚛</div>
        <h3>Keine Fahrzeuge</h3>
        <p>Kaufen Sie Ihr erstes Fahrzeug im Fahrzeugkatalog.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = GS.vehicles.map(v => {
    const cat    = DATA.VEHICLES.find(c => c.id === v.catalogId);
    const driver = GS.staff.find(s => s.id === v.driverId);
    const statusInfo = {
      idle:        { badge: 'badge-success',  label: 'Bereit' },
      driving:     { badge: 'badge-info',     label: 'Unterwegs' },
      maintenance: { badge: 'badge-warning',  label: 'Wartung' },
      broken:      { badge: 'badge-danger',   label: 'Defekt' },
    }[v.status] || { badge: 'badge-neutral', label: v.status };

    const healthColor = v.health > 60 ? 'green' : v.health > 30 ? 'yellow' : 'red';
    const fuelColor   = (v.fuel / cat.fuelCapacity * 100) > 30 ? 'green' : 'red';
    const currentLoc  = v.status === 'driving' && v.route.stops.length > 0
      ? `→ ${getCityName(v.route.stops[v.route.stops.length - 1].cityId)}`
      : getCityName(v.currentCity);

    const freeDrivers = GS.staff.filter(s => s.role === 'driver' && !s.vehicleId);
    const driverOpts  = freeDrivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

    return `
    <div class="vehicle-card">
      <div class="vehicle-card-header">
        <div class="vehicle-icon-box">${cat.icon}</div>
        <div class="vehicle-info">
          <div class="vehicle-name">${v.name}</div>
          <div class="vehicle-model">${cat.model}</div>
        </div>
        <span class="badge ${statusInfo.badge}">${statusInfo.label}</span>
      </div>

      <div class="vehicle-stats">
        <div class="vehicle-stat">
          <span class="stat-label">Fahrer</span>
          <span class="stat-value">${driver ? driver.name : '<em>Kein Fahrer</em>'}</span>
        </div>
        <div class="vehicle-stat">
          <span class="stat-label">Standort</span>
          <span class="stat-value">${currentLoc}</span>
        </div>
        <div class="vehicle-stat">
          <span class="stat-label">Nutzlast</span>
          <span class="stat-value">${fmt.weight(cat.capacity)}</span>
        </div>
        <div class="vehicle-stat">
          <span class="stat-label">km-Stand</span>
          <span class="stat-value">${fmt.km(Math.round(v.odometer))}</span>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between text-sm mb-1">
          <span class="text-muted">Zustand</span>
          <span>${Math.round(v.health)} %</span>
        </div>
        <div class="progress">
          <div class="progress-bar ${healthColor}" style="width:${v.health}%"></div>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between text-sm mb-1">
          <span class="text-muted">Kraftstoff</span>
          <span>${Math.round(v.fuel)} / ${cat.fuelCapacity} L</span>
        </div>
        <div class="progress">
          <div class="progress-bar ${fuelColor}" style="width:${v.fuel / cat.fuelCapacity * 100}%"></div>
        </div>
      </div>

      ${v.status === 'idle' && !v.driverId && freeDrivers.length > 0 ? `
      <div class="flex gap-sm items-center">
        <select class="form-control" id="drv-sel-${v.id}" style="flex:1">
          <option value="">Fahrer auswählen…</option>
          ${driverOpts}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="assignDriver('${v.id}')">Zuweisen</button>
      </div>` : ''}

      <div class="vehicle-actions">
        ${v.status === 'idle' ? `<button class="btn btn-secondary btn-sm" onclick="openRouteForVehicle('${v.id}')">🗺️ Route planen</button>` : ''}
        ${v.status === 'idle' && v.health < 70 ? `<button class="btn btn-warning btn-sm" onclick="sendToMaintenance('${v.id}')">🔧 Wartung</button>` : ''}
        ${v.status === 'broken' ? `<button class="btn btn-danger btn-sm" onclick="repairVehicle('${v.id}')">🔧 Reparieren</button>` : ''}
        ${v.status === 'idle' ? `<button class="btn btn-danger btn-sm" onclick="sellVehicle('${v.id}')">💰 Verkaufen</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function assignDriver(vehicleId) {
  const sel = $('drv-sel-' + vehicleId);
  if (!sel || !sel.value) return;
  const driverId = sel.value;
  const vehicle = GS.vehicles.find(v => v.id === vehicleId);
  const driver  = GS.staff.find(s => s.id === driverId);
  if (!vehicle || !driver) return;
  // Unassign from previous vehicle
  if (driver.vehicleId) {
    const old = GS.vehicles.find(v => v.id === driver.vehicleId);
    if (old) old.driverId = null;
  }
  vehicle.driverId = driverId;
  driver.vehicleId = vehicleId;
  showToast(`${driver.name} fährt jetzt ${vehicle.name}`, 'success');
  renderFleet();
}

function sendToMaintenance(vehicleId) {
  const v = GS.vehicles.find(v => v.id === vehicleId);
  if (!v) return;
  const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
  const cost = Math.round((100 - v.health) * cat.purchasePrice * 0.002);
  if (GS.finance.balance < cost) { showToast('Nicht genug Geld für die Wartung.', 'danger'); return; }
  v.status = 'maintenance';
  addTransaction(`Wartung: ${v.name}`, -cost);
  v.health = 100;
  setTimeout(() => {
    v.status = 'idle';
    showToast(`${v.name} ist wieder einsatzbereit.`, 'success');
    if ($('fleet-list')) renderFleet();
  }, 5000);  // 5 real seconds = quick simulation
  renderFleet();
}

function repairVehicle(vehicleId) {
  const v = GS.vehicles.find(v => v.id === vehicleId);
  if (!v) return;
  const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
  const cost = Math.round(cat.purchasePrice * 0.05);
  if (GS.finance.balance < cost) { showToast('Nicht genug Geld für die Reparatur.', 'danger'); return; }
  addTransaction(`Reparatur: ${v.name}`, -cost);
  v.status = 'idle';
  v.health = 80;
  v.fuel   = cat.fuelCapacity;
  showToast(`${v.name} repariert!`, 'success');
  renderFleet();
}

function sellVehicle(vehicleId) {
  const v = GS.vehicles.find(v => v.id === vehicleId);
  if (!v) return;
  if (v.status !== 'idle') { showToast('Fahrzeug ist gerade nicht verfügbar.', 'warning'); return; }
  const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
  const salePrice = Math.round(cat.purchasePrice * 0.55 * (v.health / 100));
  if (confirm(`${v.name} für ${fmt.money(salePrice)} verkaufen?`)) {
    // Unassign driver
    if (v.driverId) {
      const drv = GS.staff.find(s => s.id === v.driverId);
      if (drv) drv.vehicleId = null;
    }
    GS.vehicles = GS.vehicles.filter(x => x.id !== vehicleId);
    addTransaction(`Fahrzeugverkauf: ${v.name}`, salePrice);
    showToast(`${v.name} verkauft für ${fmt.money(salePrice)}`, 'success');
    renderFleet();
  }
}

// Catalog
function renderCatalog() {
  const el = $('catalog-list');
  if (!el) return;
  el.innerHTML = DATA.VEHICLES.map(cat => `
    <div class="catalog-card">
      <h3>${cat.icon} ${cat.name}</h3>
      <div class="text-muted text-sm">${cat.model}</div>
      <div class="catalog-desc">${cat.description}</div>
      <div class="catalog-specs">
        <div class="catalog-spec-item"><span class="spec-key">Nutzlast:</span> ${fmt.weight(cat.capacity)}</div>
        <div class="catalog-spec-item"><span class="spec-key">Tempo:</span> ${cat.speed} km/h</div>
        <div class="catalog-spec-item"><span class="spec-key">Tank:</span> ${cat.fuelCapacity} L</div>
        <div class="catalog-spec-item"><span class="spec-key">Verbrauch:</span> ${cat.fuelConsumption} L/100km</div>
        <div class="catalog-spec-item"><span class="spec-key">Wartung:</span> ${fmt.money(cat.maintenanceCostPerMonth)}/Mo</div>
        ${cat.requirements.length ? `<div class="catalog-spec-item"><span class="spec-key">Anforderungen:</span> ${cat.requirements.join(', ')}</div>` : ''}
      </div>
      <div class="catalog-price">${fmt.money(cat.purchasePrice)}</div>
      <button class="btn btn-primary w-full mt-sm" onclick="buyVehicle('${cat.id}')">Kaufen</button>
    </div>
  `).join('');
}

function buyVehicle(catalogId) {
  const cat = DATA.VEHICLES.find(c => c.id === catalogId);
  if (!cat) return;
  if (GS.finance.balance < cat.purchasePrice) {
    showToast('Nicht genug Geld!', 'danger'); return;
  }
  const v = createVehicle(catalogId, 'frankfurt');
  GS.vehicles.push(v);
  addTransaction(`Fahrzeugkauf: ${cat.name}`, -cat.purchasePrice);
  showToast(`${cat.name} gekauft!`, 'success');
  // Switch to my fleet tab
  document.querySelectorAll('.fleet-tab').forEach(t => t.classList.remove('active'));
  $('fleet-tab-mine') && $('fleet-tab-mine').classList.add('active');
  $('catalog-list') && ($('catalog-list').style.display = 'none');
  $('fleet-list')   && ($('fleet-list').style.display   = '');
  renderFleet();
}

// ── Orders screen ────────────────────────────────────────────
function renderOrders() {
  const tab = GS.ui.orderTab;
  let orders = [];
  if (tab === 'available') orders = GS.orders.available;
  if (tab === 'active')    orders = GS.orders.active;
  if (tab === 'completed') orders = GS.orders.completed.slice(0, 50);

  const el = $('order-list-' + tab);
  if (!el) return;

  if (orders.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>Keine Aufträge</h3>
        <p>${tab === 'available' ? 'Momentan liegen keine neuen Aufträge vor.' :
             tab === 'active'   ? 'Aktuell keine laufenden Aufträge.' :
             'Noch keine abgeschlossenen Aufträge.'}</p>
      </div>`;
    return;
  }

  const idleVehicles = GS.vehicles.filter(v => v.status === 'idle' && v.driverId);
  const vOpts = idleVehicles.map(v => {
    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    return `<option value="${v.id}">${v.name} (${fmt.weight(cat.capacity)})</option>`;
  }).join('');

  el.innerHTML = orders.map(o => {
    const ct = DATA.CARGO_TYPES.find(c => c.id === o.cargoType) || { icon: '📦', label: o.cargoType };
    const ch = { phone: '📞 Telefon', fax: '📠 Fax', online: '🌐 Online' }[o.channel] || o.channel;

    let deadlineHtml = '';
    if (tab === 'available') {
      const ageMin   = GS.time.totalMinutes - o.receivedMinute;
      const expiresIn = o.expiresInDays * 1440 - ageMin;
      const hoursLeft = Math.max(0, Math.floor(expiresIn / 60));
      deadlineHtml = `<span class="order-deadline ${hoursLeft < 12 ? 'badge-danger' : 'badge-warning'} badge">
        ⏱ noch ${hoursLeft}h</span>`;
    }

    return `
    <div class="order-card">
      <div class="order-card-header">
        <div>
          <div class="order-route">
            <span class="city">${getCityName(o.origin)}</span>
            <span class="arrow">→</span>
            <span class="city">${getCityName(o.destination)}</span>
          </div>
          <div class="text-sm text-muted mt-sm">${o.clientName}</div>
        </div>
        <div style="text-align:right">
          <div class="order-value">${fmt.money(o.value)}</div>
          ${deadlineHtml}
        </div>
      </div>

      <div class="order-meta">
        <span>${ct.icon} ${o.cargoDesc}</span>
        <span>⚖️ ${fmt.weight(o.weight)}</span>
        <span>${ch}</span>
        <span>📅 Frist: ${o.deadlineDays} Tage</span>
        <span>🎁 Bonus: ${fmt.money(o.bonus)}</span>
        ${o.requirements.length ? `<span>⚠️ ${o.requirements.join(', ')}</span>` : ''}
      </div>

      ${tab === 'available' && idleVehicles.length > 0 ? `
      <div class="order-actions">
        <select class="form-control" id="vsel-${o.id}" style="flex:1">
          <option value="">Fahrzeug wählen…</option>
          ${vOpts}
        </select>
        <button class="btn btn-success btn-sm" onclick="acceptOrder('${o.id}', $('vsel-${o.id}').value)">✓ Annehmen</button>
        <button class="btn btn-danger btn-sm"  onclick="declineOrder('${o.id}')">✗ Ablehnen</button>
      </div>` : ''}

      ${tab === 'available' && idleVehicles.length === 0 ? `
      <div class="text-sm text-muted">Kein verfügbares Fahrzeug mit Fahrer. Fahrzeug und Fahrer kaufen/einstellen.</div>
      <button class="btn btn-danger btn-sm" onclick="declineOrder('${o.id}')">✗ Ablehnen</button>
      ` : ''}

      ${tab === 'active' ? `
      <div class="order-meta">
        <span>🚛 ${o.vehicleId ? (GS.vehicles.find(v=>v.id===o.vehicleId)||{}).name || 'Unbekannt' : '-'}</span>
        <span>Status: Unterwegs</span>
      </div>` : ''}

      ${tab === 'completed' ? `
      <div class="order-meta">
        <span class="${o.finalValue >= o.value ? 'badge-success' : 'badge-warning'} badge">
          Gezahlt: ${fmt.money(o.finalValue)}
        </span>
      </div>` : ''}
    </div>`;
  }).join('');
}

function switchOrderTab(tab) {
  GS.ui.orderTab = tab;
  document.querySelectorAll('.order-tab').forEach(t => t.classList.remove('active'));
  $(`otab-${tab}`) && $(`otab-${tab}`).classList.add('active');

  // Show/hide panels
  ['available','active','completed'].forEach(t => {
    const el = $('order-list-' + t);
    if (el) el.style.display = (t === tab) ? '' : 'none';
  });
  renderOrders();
}

// ── Route planner ────────────────────────────────────────────
function openRouteForVehicle(vehicleId) {
  GS.ui.routeVehicleId = vehicleId;
  GS.ui.routeStops = [];
  showScreen('routes');
}

function renderRoutePlanner() {
  const panel = $('route-vehicle-panel');
  if (!panel) return;

  const v = GS.vehicles.find(v => v.id === GS.ui.routeVehicleId);

  // Vehicle selector
  const vOpts = GS.vehicles.filter(v => v.status === 'idle' && v.driverId)
    .map(v => `<option value="${v.id}" ${v.id === GS.ui.routeVehicleId ? 'selected' : ''}>${v.name}</option>`)
    .join('');

  panel.innerHTML = `
    <div class="form-group">
      <label class="form-label">Fahrzeug</label>
      <select class="form-control" id="route-vsel" onchange="selectRouteVehicle(this.value)">
        <option value="">Fahrzeug wählen…</option>
        ${vOpts}
      </select>
    </div>`;

  renderRouteStops();
  drawRouteMap();
  renderRouteSummary();
}

function selectRouteVehicle(id) {
  GS.ui.routeVehicleId = id;
  GS.ui.routeStops = [];
  renderRouteStops();
  renderRouteSummary();
  drawRouteMap();
}

function renderRouteStops() {
  const el = $('route-stops');
  if (!el) return;
  const stops = GS.ui.routeStops;

  if (stops.length === 0) {
    el.innerHTML = `<div class="text-muted text-sm">Klicken Sie auf die Karte, um Stopps hinzuzufügen.</div>`;
    return;
  }

  el.innerHTML = stops.map((s, i) => {
    const city   = cityById[s.cityId];
    const orders = GS.orders.available.filter(o =>
      (s.action === 'pickup' && o.origin === s.cityId) ||
      (s.action === 'delivery' && o.destination === s.cityId)
    );
    const actionLabel = s.action === 'pickup' ? '📦 Abholung' : s.action === 'delivery' ? '📬 Lieferung' : '🏁 Depot';
    return `
    <div class="route-stop">
      <div class="stop-number">${i + 1}</div>
      <div style="flex:1">
        <div class="stop-city">${city ? city.name : s.cityId}</div>
        <div class="stop-action">${actionLabel}</div>
      </div>
      <button class="remove-stop" onclick="removeRouteStop(${i})">✕</button>
    </div>`;
  }).join('');
}

function addRouteStop(cityId) {
  const city = cityById[cityId];
  if (!city) return;

  // Determine action: pickup if available order starts here, delivery if one ends here, else waypoint
  const pickupOrders   = GS.orders.available.filter(o => o.origin === cityId);
  const deliveryOrders = GS.orders.available.filter(o => o.destination === cityId);
  let action = 'waypoint';
  let orderId = null;

  if (pickupOrders.length > 0)   { action = 'pickup';   orderId = pickupOrders[0].id; }
  else if (deliveryOrders.length > 0) { action = 'delivery'; orderId = deliveryOrders[0].id; }

  GS.ui.routeStops.push({ cityId, action, orderId });
  renderRouteStops();
  renderRouteSummary();
  drawRouteMap();
}

function removeRouteStop(index) {
  GS.ui.routeStops.splice(index, 1);
  renderRouteStops();
  renderRouteSummary();
  drawRouteMap();
}

function renderRouteSummary() {
  const el = $('route-summary');
  if (!el) return;

  const stops = GS.ui.routeStops;
  if (stops.length < 2) { el.innerHTML = '<div class="text-muted text-sm">Mindestens 2 Stopps benötigt.</div>'; return; }

  const dist    = routeDistance(stops);
  const v       = GS.vehicles.find(v => v.id === GS.ui.routeVehicleId);
  const cat     = v ? DATA.VEHICLES.find(c => c.id === v.catalogId) : null;
  const hours   = cat ? Math.round(dist / cat.speed) : '?';
  const fuel    = cat ? Math.round(dist / 100 * cat.fuelConsumption) : '?';
  const fuelCost = cat ? Math.round(fuel * GS.market.fuelPrice) : '?';

  el.innerHTML = `
    <div class="route-summary-row"><span class="rs-label">Gesamtstrecke</span><span class="rs-value">${fmt.km(dist)}</span></div>
    <div class="route-summary-row"><span class="rs-label">Fahrzeit (ca.)</span><span class="rs-value">${hours}h</span></div>
    <div class="route-summary-row"><span class="rs-label">Kraftstoffkosten</span><span class="rs-value">${typeof fuelCost === 'number' ? fmt.money(fuelCost) : '?'}</span></div>
    <div class="route-summary-row"><span class="rs-label">Stopps</span><span class="rs-value">${stops.length}</span></div>
  `;
}

function dispatchRoute() {
  const vehicleId = GS.ui.routeVehicleId;
  const stops     = GS.ui.routeStops;

  if (!vehicleId)     { showToast('Kein Fahrzeug gewählt.', 'warning'); return; }
  if (stops.length < 2) { showToast('Mindestens 2 Stopps benötigt.', 'warning'); return; }

  const v = GS.vehicles.find(v => v.id === vehicleId);
  if (!v || v.status !== 'idle') { showToast('Fahrzeug nicht verfügbar.', 'warning'); return; }
  if (!v.driverId) { showToast('Kein Fahrer zugewiesen.', 'warning'); return; }

  // Add departure stop
  const fullStops = [
    { cityId: v.currentCity, action: 'depart' },
    ...stops,
  ].filter((s, i, arr) => i === 0 || s.cityId !== arr[i-1].cityId);

  v.status = 'driving';
  v.route  = {
    stops: fullStops,
    currentStopIndex: 0,
    progressPct: 0,
    totalDistance: routeDistance(fullStops),
    coveredDistance: 0,
  };
  updatePositionForVehicle(v);

  GS.ui.routeStops = [];
  showToast(`${v.name} ist losgefahren!`, 'success');
  showScreen('fleet');
}

// Route map (mini)
function drawRouteMap() {
  const canvas = $('map-canvas');
  if (!canvas) return;
  drawMapOnCanvas(canvas, GS.ui.routeStops.map(s => s.cityId), null);
}

// ── Personnel screen ─────────────────────────────────────────
function renderPersonnel() {
  const listEl = $('staff-list');
  const hireEl = $('hire-list');
  if (!listEl) return;

  // Current staff
  listEl.innerHTML = GS.staff.length === 0
    ? `<div class="empty-state"><div class="empty-icon">👥</div><h3>Keine Mitarbeiter</h3></div>`
    : GS.staff.map(s => {
        const role   = DATA.STAFF_ROLES[s.role];
        const dots   = Array(5).fill(0).map((_, i) =>
          `<div class="skill-dot ${i < s.skill ? 'filled' : ''}"></div>`).join('');
        const vehicle = s.vehicleId ? GS.vehicles.find(v => v.id === s.vehicleId) : null;
        return `
        <div class="staff-card">
          <div class="staff-card-header">
            <div class="staff-avatar">${role.icon}</div>
            <div class="staff-info">
              <div class="staff-name">${s.name}</div>
              <div class="staff-role">${role.label}</div>
            </div>
            <div>
              <div class="text-sm" style="text-align:right">${fmt.money(s.salary)}/Mo</div>
              <div class="badge badge-${s.satisfaction > 70 ? 'success' : s.satisfaction > 40 ? 'warning' : 'danger'}">
                😊 ${s.satisfaction}%
              </div>
            </div>
          </div>

          <div class="staff-stats">
            <div class="staff-stat">
              <span class="ss-label">Qualifikation</span>
              <div class="skill-dots">${dots}</div>
            </div>
            ${vehicle ? `<div class="staff-stat"><span class="ss-label">Fahrzeug</span><span class="ss-value">${vehicle.name}</span></div>` : ''}
            ${s.certifications.length ? `
            <div class="staff-stat">
              <span class="ss-label">Zertifikate</span>
              <div class="certs">${s.certifications.map(c => `<span class="cert-badge">${c}</span>`).join('')}</div>
            </div>` : ''}
          </div>

          <div class="flex gap-sm">
            <button class="btn btn-danger btn-sm" onclick="fireStaff('${s.id}')">Entlassen</button>
          </div>
        </div>`;
      }).join('');

  // Hire candidates
  if (!hireEl) return;
  if (GS.hireCandidates.length === 0) generateHireCandidates();

  hireEl.innerHTML = GS.hireCandidates.map(c => {
    const role = DATA.STAFF_ROLES[c.role];
    const dots = Array(5).fill(0).map((_,i) =>
      `<div class="skill-dot ${i < c.skill ? 'filled' : ''}"></div>`).join('');
    return `
    <div class="hire-card">
      <div class="hire-icon">${role.icon}</div>
      <div class="hire-info">
        <div class="hire-name">${c.name}</div>
        <div class="hire-details">${role.label} · Qualifikation: <div class="skill-dots" style="display:inline-flex">${dots}</div></div>
        ${c.certifications.length ? `<div class="hire-details">Zertifikate: ${c.certifications.join(', ')}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="text-sm font-bold">${fmt.money(c.salary)}/Mo</div>
        <button class="btn btn-success btn-sm mt-sm" onclick="hireStaff('${c.id}')">Einstellen</button>
      </div>
    </div>`;
  }).join('');
}

function fireStaff(staffId) {
  const s = GS.staff.find(x => x.id === staffId);
  if (!s) return;
  if (s.vehicleId) {
    const v = GS.vehicles.find(v => v.id === s.vehicleId);
    if (v && v.status === 'driving') {
      showToast('Fahrer kann nicht entlassen werden – ist noch unterwegs!', 'danger');
      return;
    }
    if (v) v.driverId = null;
  }
  const severance = s.salary;
  addTransaction(`Abfindung: ${s.name}`, -severance);
  GS.staff = GS.staff.filter(x => x.id !== staffId);
  showToast(`${s.name} entlassen.`, 'warning');
  renderPersonnel();
}

function hireStaff(candidateId) {
  const c = GS.hireCandidates.find(x => x.id === candidateId);
  if (!c) return;
  GS.staff.push(c);
  GS.hireCandidates = GS.hireCandidates.filter(x => x.id !== candidateId);
  showToast(`${c.name} eingestellt!`, 'success');
  renderPersonnel();
}

// ── Finance screen ───────────────────────────────────────────
function renderFinance() {
  const el = $('finance-kpis');
  if (!el) return;

  const monthProfit = GS.finance.monthRevenue - GS.finance.monthExpenses;
  const kpis = [
    { label: 'Kontostand',      value: fmt.money(GS.finance.balance),       css: GS.finance.balance >= 0 ? 'pos' : 'neg' },
    { label: 'Monatseinnahmen', value: fmt.money(GS.finance.monthRevenue),   css: 'pos' },
    { label: 'Monatskosten',    value: fmt.money(GS.finance.monthExpenses),  css: 'neg' },
    { label: 'Monatsergebnis',  value: fmt.money(monthProfit),               css: monthProfit >= 0 ? 'pos' : 'neg' },
    { label: 'Gesamtumsatz',    value: fmt.money(GS.stats.totalRevenue),     css: 'pos' },
    { label: 'Aufträge gesamt', value: GS.stats.ordersCompleted,             css: '' },
    { label: 'km gefahren',     value: fmt.km(Math.round(GS.stats.kmDriven)), css: '' },
    { label: 'Kraftstoffpreis', value: fmt.moneyDec(GS.market.fuelPrice) + '/L', css: '' },
  ];

  el.innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value ${k.css}">${k.value}</div>
    </div>`).join('');

  // Transactions
  const txEl = $('transaction-list');
  if (!txEl) return;
  const txs = GS.finance.transactions.slice(0, 40);
  if (txs.length === 0) {
    txEl.innerHTML = '<div class="text-muted text-sm">Noch keine Transaktionen.</div>';
    return;
  }
  txEl.innerHTML = txs.map(t => `
    <div class="transaction-row">
      <span class="tr-date">${t.date}</span>
      <span class="tr-desc">${t.desc}</span>
      <span class="tr-amount ${t.amount >= 0 ? 'inc' : 'exp'}">${fmt.money(t.amount)}</span>
    </div>`).join('');

  // Loans
  const loanEl = $('loan-list');
  if (loanEl) {
    const loans = [
      { amount: 20000, rate: 0.06, months: 12, label: 'Kurzkredit' },
      { amount: 50000, rate: 0.05, months: 24, label: 'Standardkredit' },
      { amount: 150000, rate: 0.045, months: 48, label: 'Investitionskredit' },
    ];
    loanEl.innerHTML = loans.map(l => `
      <div class="loan-card">
        <h3>${l.label}</h3>
        <div class="loan-details">
          Betrag: ${fmt.money(l.amount)}<br>
          Zinssatz: ${(l.rate * 100).toFixed(1)} %/Jahr<br>
          Laufzeit: ${l.months} Monate<br>
          Rate: ${fmt.money(Math.round(l.amount * (1 + l.rate) / l.months))}/Mo
        </div>
        <button class="btn btn-ghost btn-sm" onclick="takeLoan(${l.amount}, ${l.rate}, ${l.months})">
          Kredit aufnehmen
        </button>
      </div>`).join('');
  }
}

function takeLoan(amount, rate, months) {
  if (confirm(`Kredit über ${fmt.money(amount)} aufnehmen?`)) {
    addTransaction(`Kreditaufnahme (${months} Monate)`, amount);
    showToast(`Kredit über ${fmt.money(amount)} erhalten!`, 'success');
    renderFinance();
  }
}

// ── Map screen ───────────────────────────────────────────────
function renderMapScreen() {
  const canvas = $('map-screen-canvas');
  if (!canvas) return;
  drawMapOnCanvas(canvas, [], GS.vehicles);
  renderFleetOnMap();
}

function renderFleetOnMap() {
  const el = $('fleet-on-map');
  if (!el) return;
  if (GS.vehicles.length === 0) {
    el.innerHTML = '<div class="text-muted text-sm">Keine Fahrzeuge im Fuhrpark.</div>';
    return;
  }
  el.innerHTML = GS.vehicles.map(v => {
    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    const loc = v.status === 'driving' && v.route.stops.length
      ? `→ ${getCityName(v.route.stops[v.route.stops.length - 1].cityId)}`
      : getCityName(v.currentCity);
    return `
    <div class="map-vehicle-row">
      <div class="map-vehicle-name">${cat.icon} ${v.name}</div>
      <div class="map-vehicle-info">${loc}</div>
      <div class="progress mt-sm"><div class="progress-bar blue" style="width:${v.route.stops.length ? v.route.progressPct : 0}%"></div></div>
    </div>`;
  }).join('');
}

// ── Canvas map renderer ──────────────────────────────────────
function drawMapOnCanvas(canvas, highlightCityIds, vehicles) {
  const SCALE  = canvas.clientWidth / 800 || 1;
  canvas.width  = canvas.clientWidth  || 800;
  canvas.height = Math.round(canvas.width * 0.65);

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const sx = W / 800;
  const sy = H / 520;

  // Background
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 50 * sx) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 50 * sy) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Draw connection lines
  ctx.strokeStyle = 'rgba(88,166,255,.12)';
  ctx.lineWidth = 1;
  for (const [a, b] of DATA.CONNECTIONS) {
    const ca = cityById[a], cb = cityById[b];
    if (!ca || !cb) continue;
    ctx.beginPath();
    ctx.moveTo(ca.x * sx, ca.y * sy);
    ctx.lineTo(cb.x * sx, cb.y * sy);
    ctx.stroke();
  }

  // Draw highlight route
  if (highlightCityIds && highlightCityIds.length > 1) {
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth   = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < highlightCityIds.length; i++) {
      const c = cityById[highlightCityIds[i]];
      if (!c) continue;
      if (i === 0) ctx.moveTo(c.x * sx, c.y * sy);
      else ctx.lineTo(c.x * sx, c.y * sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw vehicle routes
  if (vehicles) {
    ctx.strokeStyle = 'rgba(63,185,80,.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (const v of vehicles) {
      if (v.status !== 'driving' || !v.route.stops.length) continue;
      ctx.beginPath();
      let started = false;
      for (const stop of v.route.stops) {
        const c = cityById[stop.cityId];
        if (!c) continue;
        if (!started) { ctx.moveTo(c.x * sx, c.y * sy); started = true; }
        else ctx.lineTo(c.x * sx, c.y * sy);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Draw cities
  for (const city of DATA.CITIES) {
    const cx = city.x * sx;
    const cy = city.y * sy;
    const isHighlit = highlightCityIds && highlightCityIds.includes(city.id);
    const isHub = city.hub;

    ctx.beginPath();
    ctx.arc(cx, cy, isHub ? 4 * sx : 2.5 * sx, 0, Math.PI * 2);
    ctx.fillStyle = isHighlit ? '#e94560' : isHub ? '#58a6ff' : 'rgba(255,255,255,.5)';
    ctx.fill();

    if (isHighlit || (W > 500 && isHub)) {
      ctx.fillStyle = isHighlit ? '#fff' : '#8b949e';
      ctx.font = `${isHighlit ? 700 : 400} ${Math.max(8, 10 * sx)}px sans-serif`;
      ctx.fillText(city.name, cx + 5 * sx, cy + 4 * sy);
    }
  }

  // Draw vehicles
  if (vehicles) {
    for (const v of vehicles) {
      if (!v.position) continue;
      const vx = v.position.x * sx;
      const vy = v.position.y * sy;
      ctx.beginPath();
      ctx.arc(vx, vy, 5 * sx, 0, Math.PI * 2);
      ctx.fillStyle = v.status === 'driving' ? '#3fb950' : '#f85149';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Highlight stop numbers
  if (highlightCityIds) {
    highlightCityIds.forEach((cityId, i) => {
      const c = cityById[cityId];
      if (!c) return;
      ctx.beginPath();
      ctx.arc(c.x * sx, c.y * sy, 7 * sx, 0, Math.PI * 2);
      ctx.fillStyle = '#e94560';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, 10 * sx)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, c.x * sx, c.y * sy);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    });
  }
}

// Map canvas click handler (route planner)
function handleMapClick(e) {
  const canvas = $('map-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / canvas.clientWidth * 800;
  const my = (e.clientY - rect.top)  / canvas.clientHeight * 520;

  // Find nearest city within 20px
  let closest = null, minDist = 20;
  for (const city of DATA.CITIES) {
    const d = Math.sqrt(Math.pow(city.x - mx, 2) + Math.pow(city.y - my, 2));
    if (d < minDist) { minDist = d; closest = city; }
  }
  if (closest) addRouteStop(closest.id);
}

// ── Modals ───────────────────────────────────────────────────
function openEventsModal() {
  const html = GS.market.activeEvents.length === 0
    ? '<div class="text-muted text-sm">Keine aktiven Marktereignisse.</div>'
    : GS.market.activeEvents.map(e =>
        `<div class="event-card">
           <strong>${e.title}</strong>
           <div class="text-sm text-muted mt-sm">Noch ${e.remainingDays} Tage aktiv</div>
         </div>`
      ).join('');

  openModal('Markt & Ereignisse', html);
}

function openSettingsModal() {
  const html = `
    <div class="flex flex-col gap-md">
      <button class="btn btn-secondary" onclick="autoSave();showToast('Gespeichert!','success')">💾 Manuell speichern</button>
      <button class="btn btn-danger"    onclick="if(confirm('Wirklich neu starten?')){deleteSave();location.reload()}">🗑️ Spielstand löschen & neu starten</button>
    </div>`;
  openModal('Einstellungen', html);
}

function openStatsModal() {
  const html = `
    <div class="table-wrap">
      <table>
        <tr><th>Statistik</th><th>Wert</th></tr>
        <tr><td>Aufträge abgeschlossen</td><td>${GS.stats.ordersCompleted}</td></tr>
        <tr><td>Aufträge fehlgeschlagen</td><td>${GS.stats.ordersFailed}</td></tr>
        <tr><td>Gesamtumsatz</td><td>${fmt.money(GS.stats.totalRevenue)}</td></tr>
        <tr><td>Gesamtkosten</td><td>${fmt.money(GS.stats.totalExpenses)}</td></tr>
        <tr><td>Kilometer gefahren</td><td>${fmt.km(Math.round(GS.stats.kmDriven))}</td></tr>
        <tr><td>Mitarbeiter</td><td>${GS.staff.length}</td></tr>
        <tr><td>Fahrzeuge</td><td>${GS.vehicles.length}</td></tr>
        <tr><td>Ansehen</td><td>${GS.company.reputation} / 100</td></tr>
      </table>
    </div>`;
  openModal('Unternehmensstatistik', html);
}

function openModal(title, bodyHtml) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML   = bodyHtml;
  $('modal-overlay').classList.add('open');
}

function closeModal() {
  $('modal-overlay').classList.remove('open');
}

// ── DOM init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Speed buttons
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.addEventListener('click', () => setSpeed(parseInt(b.dataset.speed)));
  });

  // Map canvas click
  const mc = $('map-canvas');
  if (mc) mc.addEventListener('click', handleMapClick);

  // Check for saved game
  if (hasSave()) {
    $('btn-continue') && ($('btn-continue').style.display = 'inline-flex');
  }

  // Menu tabs
  document.querySelectorAll('.menu-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.menu-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.menu-pane').forEach(p => {
        p.style.display = p.id === 'pane-' + t.dataset.tab ? '' : 'none';
      });
    });
  });

  // Difficulty options
  document.querySelectorAll('.diff-option').forEach(d => {
    d.addEventListener('click', () => {
      document.querySelectorAll('.diff-option').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
    });
  });

  // Mode options
  document.querySelectorAll('.mode-option').forEach(m => {
    m.addEventListener('click', () => {
      document.querySelectorAll('.mode-option').forEach(x => x.classList.remove('selected'));
      m.classList.add('selected');
    });
  });

  // Fleet tabs
  document.querySelectorAll('.fleet-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.fleet-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      if (t.id === 'fleet-tab-mine') {
        $('fleet-list').style.display   = '';
        $('catalog-list').style.display = 'none';
        renderFleet();
      } else {
        $('fleet-list').style.display   = 'none';
        $('catalog-list').style.display = '';
        renderCatalog();
      }
    });
  });

  // Order tabs
  document.querySelectorAll('.order-tab').forEach(t => {
    t.addEventListener('click', () => switchOrderTab(t.dataset.tab));
  });

  // Dispatch route
  const dispBtn = $('btn-dispatch');
  if (dispBtn) dispBtn.addEventListener('click', dispatchRoute);

  // Modal close
  const ov = $('modal-overlay');
  if (ov) ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });

  // Resize map canvas on window resize
  window.addEventListener('resize', () => {
    if (GS.ui.currentScreen === 'map')    renderMapScreen();
    if (GS.ui.currentScreen === 'routes') drawRouteMap();
  });
});
