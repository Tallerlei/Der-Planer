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

  company: { name: 'Meine Spedition', mode: 'story', difficulty: 'normal', hqCity: 'frankfurt' },

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
    lastRenderMs: 0,         // timestamp of last DOM render (for throttle)
    mapZoom: 1,              // 1 = Totale, 2 = Regionalansicht
    mapCenter: { x: 400, y: 260 },  // view center in data coordinates
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

// ── Road-network shortest path (Dijkstra) ────────────────────
function findShortestPath(fromId, toId) {
  if (fromId === toId) return [fromId];

  // Build adjacency list from road connections
  const adj = {};
  for (const [a, b, dist] of DATA.CONNECTIONS) {
    if (!adj[a]) adj[a] = [];
    if (!adj[b]) adj[b] = [];
    adj[a].push({ id: b, dist });
    adj[b].push({ id: a, dist });
  }

  const dist  = {};
  const prev  = {};
  const queue = [];
  for (const c of DATA.CITIES) dist[c.id] = Infinity;
  dist[fromId] = 0;
  queue.push({ id: fromId, d: 0 });

  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d);
    const { id: cur, d: curD } = queue.shift();
    if (curD > dist[cur]) continue;  // stale entry
    if (cur === toId) break;
    for (const { id: nb, dist: w } of (adj[cur] || [])) {
      const nd = dist[cur] + w;
      if (nd < dist[nb]) {
        dist[nb] = nd;
        prev[nb] = cur;
        queue.push({ id: nb, d: nd });
      }
    }
  }

  if (dist[toId] === Infinity) return [fromId, toId]; // no road path, fallback

  const path = [];
  let cur = toId;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

// Expand key waypoints into a full multi-hop route following the road network.
// keyWaypoints: [{cityId, action, orderId?}, ...]
function buildRouteStops(keyWaypoints) {
  if (keyWaypoints.length === 0) return [];
  const result = [keyWaypoints[0]];
  for (let i = 1; i < keyWaypoints.length; i++) {
    const path = findShortestPath(keyWaypoints[i - 1].cityId, keyWaypoints[i].cityId);
    // Add intermediate transit stops (skip first city – already in result)
    for (let j = 1; j < path.length - 1; j++) {
      result.push({ cityId: path[j], action: 'transit' });
    }
    result.push(keyWaypoints[i]);
  }
  return result;
}

// ── Vehicle factory ──────────────────────────────────────────
function createVehicle(catalogId, homeCityId) {
  const cat = DATA.VEHICLES.find(v => v.id === catalogId);
  if (!cat) return null;
  const num = GS.vehicles.filter(v => v.catalogId === catalogId).length + 1;
  const homeCityIdResolved = homeCityId || 'frankfurt';
  const homeCity = cityById[homeCityIdResolved];
  return {
    id: uid(),
    catalogId,
    name: `${cat.name} #${num}`,
    health: 100,
    fuel: cat.fuelCapacity,
    odometer: 0,
    driverId: null,
    status: 'idle',    // idle | driving | maintenance | broken
    homeCity: homeCityIdResolved,
    currentCity: homeCityIdResolved,
    route: {
      stops: [],
      currentStopIndex: 0,
      progressPct: 0,   // 0-100 within current leg
      totalDistance: 0,
      coveredDistance: 0,
    },
    position: homeCity ? { x: homeCity.x, y: homeCity.y } : { x: 0, y: 0 },
    refuelPauseMinutes: 0,  // remaining minutes of a refueling stop
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
    const isUrgent = Math.random() < 0.15;  // 15% chance of urgent order

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
      value: isUrgent ? Math.round(baseVal * 1.4) : baseVal,  // urgent pays 40% more
      penalty: Math.round(baseVal * 0.1 * DATA.DIFFICULTY[GS.company.difficulty].orderPenaltyMod),
      bonus: Math.round(baseVal * 0.08),
      deadlineDays: isUrgent ? 1 : deadlineDays,
      isUrgent,
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

  // Set up vehicle route following road network: current → pickup → delivery → home
  vehicle.status = 'driving';
  const keyWaypoints = [
    { cityId: vehicle.currentCity, action: 'depart' },
    { cityId: order.origin,        action: 'pickup',   orderId: order.id },
    { cityId: order.destination,   action: 'delivery', orderId: order.id },
    { cityId: vehicle.homeCity,    action: 'return' },
  ];
  const expandedStops = buildRouteStops(keyWaypoints)
    .filter((s, i, arr) => i === 0 || s.cityId !== arr[i - 1].cityId);

  vehicle.route = {
    stops: expandedStops,
    currentStopIndex: 0,
    progressPct: 0,
    totalDistance: routeDistance(expandedStops),
    coveredDistance: 0,
  };

  updatePositionForVehicle(vehicle);

  showToast(`Auftrag angenommen: ${order.clientName}`, 'success');
  advanceGameTime(TIME_COSTS.assignOrder, 'Auftragsübernahme');
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
  if (!stops || stops.length === 0) {
    // Vehicle is idle – snap to its current city
    const c = cityById[v.currentCity];
    if (c) { v.position.x = c.x; v.position.y = c.y; }
    return;
  }
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
      // ── Handle active refueling stop ─────────────────────────
      if ((v.refuelPauseMinutes || 0) > 0) {
        const pause = Math.min(v.refuelPauseMinutes, remainingMinutes);
        remainingMinutes -= pause;
        v.refuelPauseMinutes -= pause;
        if (v.refuelPauseMinutes <= 0) {
          // Refueling complete
          const litres = cat.fuelCapacity - v.fuel;
          const cost = litres * GS.market.fuelPrice;
          addTransaction(`Tankstopp ${v.name}`, -cost);
          v.fuel = cat.fuelCapacity;
          showToast(`⛽ ${v.name}: Getankt`, 'info');
        }
        continue;
      }

      // ── Auto-refuel when fuel is low (< 15 % capacity) ───────
      if (v.fuel < cat.fuelCapacity * REFUEL_THRESHOLD) {
        v.refuelPauseMinutes = REFUEL_DURATION_MINUTES;
        showToast(`⛽ ${v.name}: Tankstopp (${REFUEL_DURATION_MINUTES} Min)`, 'info');
        continue;
      }

      const idx  = v.route.currentStopIndex;
      const from = stops[idx];
      const to   = stops[idx + 1];
      if (!to) { arriveAtFinalStop(v); break; }

      const legDist = getDistance(from.cityId, to.cityId);
      const legKmDone = (v.route.progressPct / 100) * legDist;
      const legRemaining = legDist - legKmDone;
      const kmThisTick = kmPerMinute * remainingMinutes;
      // Only consume fuel/odometer for km actually driven this iteration
      const kmActual = Math.min(kmThisTick, legRemaining);

      // Fuel consumption (only for actual km driven)
      const fuelUsed = (kmActual / 100) * cat.fuelConsumption;
      v.fuel = Math.max(0, v.fuel - fuelUsed);
      v.odometer += kmActual;
      GS.stats.kmDriven += kmActual;

      // Health degradation (per 10 000 km roughly 1 point)
      v.health = Math.max(0, v.health - kmActual * 0.0001);

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
        v.route.progressPct = ((legKmDone + kmActual) / legDist) * 100;
        remainingMinutes = 0;
      }
    }

    updatePositionForVehicle(v);
  }
}

function processStopAction(v, stop) {
  if (!stop.action || stop.action === 'depart' || stop.action === 'return' || stop.action === 'transit') return;

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

// ── Action time costs ────────────────────────────────────────
// Base time costs (in game-minutes) for player actions.
// The actual cost is scaled by the difficulty's timeCostMod.
const TIME_COSTS = {
  navigate:      5,   // Switching rooms / screens
  assignOrder:  30,   // Accepting/assigning an order to a vehicle
  dispatchRoute: 30,  // Dispatching a multi-stop route
  hireStaff:    15,   // Hiring a new employee
  fireStaff:    15,   // Firing an employee
  buyVehicle:   15,   // Buying a vehicle from the catalog
  sellVehicle:  15,   // Selling a vehicle
  maintenance:  30,   // Sending a vehicle to maintenance
  repair:       15,   // Repairing a broken vehicle
  assignDriver: 10,   // Assigning a driver to a vehicle
  takeLoan:     15,   // Taking out a loan
  refreshCand:   5,   // Refreshing the hire candidate pool
};

// Automatic refueling parameters
const REFUEL_THRESHOLD        = 0.15;  // Trigger a stop when fuel < 15 % of capacity
const REFUEL_DURATION_MINUTES = 15;    // Duration of an automatic refueling stop (game-minutes)

// Render throttle: passive ticks update the DOM at most this often (ms)
const RENDER_THROTTLE_MS = 950;

// Toast display timings (ms) – must align with CSS animation durations
const TOAST_DISPLAY_MS  = 2200;  // how long the toast is fully visible
const TOAST_FADE_MS     = 400;   // fade-out duration (matches CSS)
// Clock-flash animation duration in CSS is 0.65 s (650 ms)
const CLOCK_FLASH_MS    = 650;

// ── Central time advancement ─────────────────────────────────
/**
 * Advances game time by `minutes` game-minutes.
 * When `label` is provided the call is treated as a player action:
 *   – the difficulty timeCostMod is applied to `minutes`
 *   – an animated "+X Min" notification is shown
 *   – the clock in the status bar flashes
 */
function advanceGameTime(minutes, label) {
  if (!GS.started) return;

  // Apply difficulty modifier only for labelled (player-action) advances
  let actualMinutes = minutes;
  if (label) {
    const mod = (DATA.DIFFICULTY[GS.company.difficulty] || {}).timeCostMod || 1.0;
    actualMinutes = Math.max(1, Math.round(minutes * mod));
  }

  const prevTotal = GS.time.totalMinutes;
  GS.time.totalMinutes += actualMinutes;

  // Recompute time-of-day
  const totalMinInDay = GS.time.totalMinutes % 1440;
  GS.time.hour   = Math.floor(totalMinInDay / 60);
  GS.time.minute = totalMinInDay % 60;

  // Handle day / month / year rollovers
  const prevDayNum = Math.floor(prevTotal / 1440);
  const newDayNum  = Math.floor(GS.time.totalMinutes / 1440);
  for (let d = prevDayNum + 1; d <= newDayNum; d++) {
    GS.time.day++;
    const daysInMonth = [0,31,28,31,30,31,30,31,31,30,31,30,31];
    if (GS.time.day > daysInMonth[GS.time.month]) {
      GS.time.day = 1;
      GS.time.month++;
      if (GS.time.month > 12) { GS.time.month = 1; GS.time.year++; }
      processMonthEnd();
    }
  }
  if (newDayNum > prevDayNum) {
    expireOrders();
    autoSave();
  }

  // Move vehicles
  tickVehicles(actualMinutes);

  // Generate orders at intervals (2–4 game hours)
  if (GS.time.totalMinutes - GS.ui.lastOrderCheckMin >= rand(120, 240)) {
    GS.ui.lastOrderCheckMin = GS.time.totalMinutes;
    generateOrders();
  }

  // Market events roughly once per day
  if (GS.time.totalMinutes - GS.ui.lastEventCheckMin >= 1440) {
    GS.ui.lastEventCheckMin = GS.time.totalMinutes;
    checkMarketEvents();
  }

  updateStatusBar();

  // Visual feedback for player actions
  if (label) {
    showTimeAdvance(actualMinutes, label);
  }

  // Throttle passive (no-label) screen renders to max once per second
  const now = Date.now();
  const shouldRender = label || !GS.ui.lastRenderMs || (now - GS.ui.lastRenderMs) >= RENDER_THROTTLE_MS;
  if (shouldRender) {
    GS.ui.lastRenderMs = now;
    const screen = GS.ui.currentScreen;
    if (screen === 'fleet')    renderFleet();
    if (screen === 'orders')   renderOrders();
    if (screen === 'map')      renderMapScreen();
    if (screen === 'finance')  renderFinance();
    if (screen === 'office')   renderOffice();
  }
}

// Show an animated "+X Min" badge and flash the clock
function showTimeAdvance(minutes, label) {
  // Flash the date/time element in the status bar
  const dateEl = $('sb-date');
  if (dateEl) {
    dateEl.classList.remove('time-flash');
    // Force reflow so the animation restarts
    void dateEl.offsetWidth;
    dateEl.classList.add('time-flash');
    setTimeout(() => dateEl.classList.remove('time-flash'), CLOCK_FLASH_MS);
  }

  // Show a small time-advance toast
  const container = $('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast time-advance';
  el.innerHTML = `<span class="ta-icon">⏰</span> <strong>+${minutes} Min</strong> <span class="ta-label">${label}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), TOAST_FADE_MS);
  }, TOAST_DISPLAY_MS);
}

// ── Game loop ────────────────────────────────────────────────
let loopInterval = null;
const MINUTES_PER_TICK = 1;  // Background: 1 game-minute per tick (real-time interval depends on speed setting)

function startLoop() {
  if (loopInterval) clearInterval(loopInterval);
  loopInterval = setInterval(gameTick, Math.round(1000 / GS.speed));
}

function gameTick() {
  if (GS.paused) return;
  advanceGameTime(MINUTES_PER_TICK); // no label → passive background tick
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
    // Migrate vehicles from older saves
    GS.vehicles.forEach(v => {
      if (v.refuelPauseMinutes === undefined) v.refuelPauseMinutes = 0;
      // Fix position if stuck at origin (old saves had {0,0})
      updatePositionForVehicle(v);
    });
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

/**
 * Player-initiated navigation that costs 5 game minutes.
 * Use this for sidebar buttons and office-room tiles.
 * Programmatic navigation (after dispatching, buying, etc.) still uses showScreen().
 */
function navigateToScreen(name) {
  showScreen(name);
  if (GS.started) advanceGameTime(TIME_COSTS.navigate, 'Bildschirmwechsel');
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
  GS.company.hqCity     = 'frankfurt';

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
  // Ensure new map state fields exist (backward compatibility)
  if (!GS.ui.mapZoom)      GS.ui.mapZoom      = 1;
  if (!GS.ui.mapCenter)    GS.ui.mapCenter    = { x: 400, y: 260 };
  if (!GS.company.hqCity)  GS.company.hqCity  = 'frankfurt';
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

// Player-triggered candidate refresh (costs time)
function refreshCandidates() {
  generateHireCandidates();
  if (GS.started) advanceGameTime(TIME_COSTS.refreshCand, 'Kandidatensuche');
  renderPersonnel();
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
    <div class="office-room"
         title="${r.screen ? `Wechsel zu: ${r.name} (+${TIME_COSTS.navigate} Min)` : r.name}"
         onclick="${r.screen ? `navigateToScreen('${r.screen}')` : `officeAction('${r.action}')`}">
      <span class="room-icon">${r.icon}</span>
      <span class="room-name">${r.name}</span>
      <span class="room-desc">${r.desc}</span>
      ${r.screen ? `<span class="room-time-cost">+${TIME_COSTS.navigate} Min</span>` : ''}
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
        <button class="btn btn-secondary btn-sm" title="Fahrer zuweisen: +${TIME_COSTS.assignDriver} Min" onclick="assignDriver('${v.id}')">Zuweisen</button>
      </div>` : ''}

      <div class="vehicle-actions">
        ${v.status === 'idle' ? `<button class="btn btn-secondary btn-sm" title="Route planen: +${TIME_COSTS.navigate} Min" onclick="openRouteForVehicle('${v.id}')">🗺️ Route planen</button>` : ''}
        ${v.status === 'idle' && v.health < 70 ? `<button class="btn btn-warning btn-sm" title="Wartung: +${TIME_COSTS.maintenance} Min" onclick="sendToMaintenance('${v.id}')">🔧 Wartung</button>` : ''}
        ${v.status === 'broken' ? `<button class="btn btn-danger btn-sm" title="Reparieren: +${TIME_COSTS.repair} Min" onclick="repairVehicle('${v.id}')">🔧 Reparieren</button>` : ''}
        ${v.status === 'idle' ? `<button class="btn btn-danger btn-sm" title="Verkaufen: +${TIME_COSTS.sellVehicle} Min" onclick="sellVehicle('${v.id}')">💰 Verkaufen</button>` : ''}
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
  advanceGameTime(TIME_COSTS.assignDriver, 'Fahrerzuweisung');
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
  advanceGameTime(TIME_COSTS.maintenance, 'Wartungsauftrag');
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
  advanceGameTime(TIME_COSTS.repair, 'Fahrzeugreparatur');
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
    advanceGameTime(TIME_COSTS.sellVehicle, 'Fahrzeugverkauf');
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
      <button class="btn btn-primary w-full mt-sm" title="Fahrzeug kaufen: +${TIME_COSTS.buyVehicle} Min" onclick="buyVehicle('${cat.id}')">Kaufen</button>
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
  advanceGameTime(TIME_COSTS.buyVehicle, 'Fahrzeugkauf');
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
    const urgentBadge = o.isUrgent ? `<span class="badge badge-danger urgent-badge" title="Eilauftrag – kurze Frist, höhere Vergütung">⚡ Eilauftrag</span>` : '';

    let deadlineHtml = '';
    if (tab === 'available') {
      const ageMin   = GS.time.totalMinutes - o.receivedMinute;
      const expiresIn = o.expiresInDays * 1440 - ageMin;
      const hoursLeft = Math.max(0, Math.floor(expiresIn / 60));
      deadlineHtml = `<span class="order-deadline ${hoursLeft < 12 ? 'badge-danger' : 'badge-warning'} badge">
        ⏱ noch ${hoursLeft}h</span>`;
    }

    return `
    <div class="order-card${o.isUrgent ? ' order-card-urgent' : ''}">
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
          ${urgentBadge}
          ${deadlineHtml}
        </div>
      </div>

      <div class="order-meta">
        <span>${ct.icon} ${o.cargoDesc}</span>
        <span>⚖️ ${fmt.weight(o.weight)}</span>
        <span>${ch}</span>
        <span>${o.isUrgent ? '🔴' : '📅'} Frist: ${o.deadlineDays} ${o.deadlineDays === 1 ? 'Tag' : 'Tage'}</span>
        <span>🎁 Bonus: ${fmt.money(o.bonus)}</span>
        ${o.requirements.length ? `<span>⚠️ ${o.requirements.join(', ')}</span>` : ''}
      </div>

      ${tab === 'available' && idleVehicles.length > 0 ? `
      <div class="order-actions">
        <select class="form-control" id="vsel-${o.id}" style="flex:1">
          <option value="">Fahrzeug wählen…</option>
          ${vOpts}
        </select>
        <button class="btn btn-success btn-sm"
                title="Auftrag annehmen: +${TIME_COSTS.assignOrder} Min"
                onclick="acceptOrder('${o.id}', $('vsel-${o.id}').value)">✓ Annehmen</button>
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
  navigateToScreen('routes');
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

  // Compute the actual road-network distance using expanded route
  const v       = GS.vehicles.find(v => v.id === GS.ui.routeVehicleId);
  const keyWaypoints = v
    ? [{ cityId: v.currentCity, action: 'depart' }, ...stops]
    : stops;
  const expandedStops = buildRouteStops(keyWaypoints)
    .filter((s, i, arr) => i === 0 || s.cityId !== arr[i - 1].cityId);
  const dist    = routeDistance(expandedStops);
  const cat     = v ? DATA.VEHICLES.find(c => c.id === v.catalogId) : null;
  const hours   = cat ? Math.round(dist / cat.speed) : '?';
  const fuel    = cat ? Math.round(dist / 100 * cat.fuelConsumption) : '?';
  const fuelCost = cat ? Math.round(fuel * GS.market.fuelPrice) : '?';

  el.innerHTML = `
    <div class="route-summary-row"><span class="rs-label">Gesamtstrecke</span><span class="rs-value">${fmt.km(dist)}</span></div>
    <div class="route-summary-row"><span class="rs-label">Fahrzeit (ca.)</span><span class="rs-value">${hours}h</span></div>
    <div class="route-summary-row"><span class="rs-label">Kraftstoffkosten</span><span class="rs-value">${typeof fuelCost === 'number' ? fmt.money(fuelCost) : '?'}</span></div>
    <div class="route-summary-row"><span class="rs-label">Stopps</span><span class="rs-value">${stops.length}</span></div>
    <div class="route-summary-row time-cost-row"><span class="rs-label">⏰ Zeitaufwand</span><span class="rs-value time-cost">+${TIME_COSTS.dispatchRoute} Min</span></div>
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

  // Expand route through road network
  const keyWaypoints = [
    { cityId: v.currentCity, action: 'depart' },
    ...stops,
  ];
  const fullStops = buildRouteStops(keyWaypoints)
    .filter((s, i, arr) => i === 0 || s.cityId !== arr[i - 1].cityId);

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
  advanceGameTime(TIME_COSTS.dispatchRoute, 'Routendisposition');
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
            <button class="btn btn-danger btn-sm" title="Entlassen: +${TIME_COSTS.fireStaff} Min" onclick="fireStaff('${s.id}')">Entlassen</button>
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
        <button class="btn btn-success btn-sm mt-sm" title="Einstellen: +${TIME_COSTS.hireStaff} Min" onclick="hireStaff('${c.id}')">Einstellen</button>
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
  advanceGameTime(TIME_COSTS.fireStaff, 'Entlassung');
  renderPersonnel();
}

function hireStaff(candidateId) {
  const c = GS.hireCandidates.find(x => x.id === candidateId);
  if (!c) return;
  GS.staff.push(c);
  GS.hireCandidates = GS.hireCandidates.filter(x => x.id !== candidateId);
  showToast(`${c.name} eingestellt!`, 'success');
  advanceGameTime(TIME_COSTS.hireStaff, 'Einstellung');
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
    advanceGameTime(TIME_COSTS.takeLoan, 'Kreditaufnahme');
    renderFinance();
  }
}

// ── Map screen ───────────────────────────────────────────────
function renderMapScreen() {
  const canvas = $('map-screen-canvas');
  if (!canvas) return;
  drawMapOnCanvas(canvas, [], GS.vehicles, { zoom: GS.ui.mapZoom, center: GS.ui.mapCenter });
  renderFleetOnMap();
  renderQuickNav();
  updateZoomButtons();
}

function updateZoomButtons() {
  const btn1 = $('map-zoom-out');
  const btn2 = $('map-zoom-in');
  if (btn1) btn1.disabled = (GS.ui.mapZoom <= 1);
  if (btn2) btn2.disabled = (GS.ui.mapZoom >= 2);
}

function setMapZoom(level, cx, cy) {
  GS.ui.mapZoom = Math.max(1, Math.min(2, level));
  if (cx !== undefined && cy !== undefined) {
    GS.ui.mapCenter.x = Math.max(0, Math.min(800, cx));
    GS.ui.mapCenter.y = Math.max(0, Math.min(520, cy));
  }
  renderMapScreen();
}

// Jump the map to a given data coordinate at zoom level 2
function mapJumpTo(dataX, dataY) {
  setMapZoom(2, dataX, dataY);
}

function renderQuickNav() {
  const el = $('map-quick-nav');
  if (!el) return;

  const hqCityId = GS.company.hqCity || 'frankfurt';
  const hqCity = cityById[hqCityId] || cityById['frankfurt'];

  let html = '';

  // HQ entry
  html += `<div class="qnav-item" onclick="mapJumpTo(${hqCity.x},${hqCity.y})" title="Zur Firmenzentrale zoomen">
    <span class="qnav-icon">🏢</span>
    <span class="qnav-label">Zentrale (${hqCity.name})</span>
  </div>`;

  // Active order destinations
  if (GS.orders.active.length > 0) {
    html += '<div class="qnav-section">Auftragsziele</div>';
    const seen = new Set();
    const targets = [];
    for (const order of GS.orders.active) {
      targets.push({ cityId: order.origin,      icon: '📦', label: 'Abholung'  });
      targets.push({ cityId: order.destination, icon: '🏁', label: 'Lieferung' });
    }
    for (const { cityId, icon, label } of targets) {
      const key = cityId + icon;
      if (seen.has(key)) continue;
      seen.add(key);
      const city = cityById[cityId];
      if (!city) continue;
      html += `<div class="qnav-item" onclick="mapJumpTo(${city.x},${city.y})" title="${label}: ${city.name}">
        <span class="qnav-icon">${icon}</span>
        <span class="qnav-label">${city.name}</span>
      </div>`;
    }
  }

  // Fleet vehicles
  if (GS.vehicles.length > 0) {
    html += '<div class="qnav-section">Flotte</div>';
    for (const v of GS.vehicles) {
      const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
      const pos = v.position;
      if (!pos) continue;
      const statusDot = v.status === 'driving' ? '🟢' : v.status === 'broken' ? '🔴' : '⚪';
      html += `<div class="qnav-item" onclick="mapJumpToVehicle('${v.id}')" title="${v.name} anzeigen">
        <span class="qnav-icon">${statusDot}</span>
        <span class="qnav-label">${cat.icon} ${v.name}</span>
      </div>`;
    }
  }

  el.innerHTML = html || '<div class="qnav-empty">Keine Einträge</div>';
}

function mapJumpToVehicle(vehicleId) {
  const v = GS.vehicles.find(x => x.id === vehicleId);
  if (!v || !v.position) return;
  mapJumpTo(v.position.x, v.position.y);
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

// Open vehicle info panel (from map click)
function openVehicleInfoPanel(vehicleId) {
  const v = GS.vehicles.find(x => x.id === vehicleId);
  if (!v) return;
  const cat    = DATA.VEHICLES.find(c => c.id === v.catalogId);
  const driver = GS.staff.find(s => s.id === v.driverId);
  const activeOrder = GS.orders.active.find(o => o.vehicleId === v.id);

  const statusLabels = { idle: 'Bereit', driving: 'Unterwegs', maintenance: 'Wartung', broken: 'Defekt' };
  const statusLabel = statusLabels[v.status] || v.status;

  let orderHtml = '<div class="text-muted text-sm">Kein aktiver Auftrag</div>';
  if (activeOrder) {
    orderHtml = `
      <div class="vinfo-row"><span class="vinfo-label">Auftrag</span><span>${activeOrder.clientName}</span></div>
      <div class="vinfo-row"><span class="vinfo-label">Fracht</span><span>${activeOrder.cargoDesc}</span></div>
      <div class="vinfo-row"><span class="vinfo-label">Route</span><span>${getCityName(activeOrder.origin)} → ${getCityName(activeOrder.destination)}</span></div>
      <div class="vinfo-row"><span class="vinfo-label">Fortschritt</span><span>${Math.round(v.route.progressPct)}%</span></div>`;
  }

  const idleVehicles = GS.vehicles.filter(x => x.status === 'idle' && x.id !== v.id);
  const assignOpts   = GS.orders.available.length > 0 && v.status === 'idle'
    ? `<button class="btn btn-primary btn-sm w-full" onclick="closeModal();navigateToScreen('orders')" style="margin-top:.75rem">
         📋 Auftrag aus Auftragsliste zuweisen
       </button>`
    : '';

  const html = `
    <div class="vehicle-info-panel">
      <div class="vinfo-header">
        <span class="vinfo-icon">${cat.icon}</span>
        <div>
          <div class="vinfo-name">${v.name}</div>
          <div class="vinfo-model text-muted text-sm">${cat.model}</div>
        </div>
        <span class="badge ${v.status === 'idle' ? 'badge-success' : v.status === 'driving' ? 'badge-info' : 'badge-danger'}">${statusLabel}</span>
      </div>
      <div class="vinfo-stats">
        <div class="vinfo-row"><span class="vinfo-label">Fahrer</span><span>${driver ? driver.name : '– kein Fahrer –'}</span></div>
        <div class="vinfo-row"><span class="vinfo-label">Standort</span><span>${getCityName(v.currentCity)}</span></div>
        <div class="vinfo-row"><span class="vinfo-label">Gesundheit</span><span>${Math.round(v.health)} %</span></div>
        <div class="vinfo-row"><span class="vinfo-label">Kraftstoff</span><span>${Math.round(v.fuel)} / ${cat.fuelCapacity} L</span></div>
      </div>
      <div class="vinfo-order">${orderHtml}</div>
      ${assignOpts}
    </div>`;

  openModal(v.name, html);
}

// Handle clicks on the map-screen-canvas (vehicle selection)
function handleMapScreenClick(e) {
  const canvas = $('map-screen-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  const zoom = GS.ui.mapZoom;
  const viewW = 800 / zoom;
  const viewH = 520 / zoom;
  const cx = GS.ui.mapCenter.x;
  const cy = GS.ui.mapCenter.y;
  const offsetX = Math.max(0, Math.min(800 - viewW, cx - viewW / 2));
  const offsetY = Math.max(0, Math.min(520 - viewH, cy - viewH / 2));

  // Convert pixel click to data coordinates
  const clickDataX = (e.clientX - rect.left) / canvas.clientWidth  * viewW + offsetX;
  const clickDataY = (e.clientY - rect.top)  / canvas.clientHeight * viewH + offsetY;

  // Threshold in data units (~10px at zoom1, ~5px at zoom2)
  const threshold = 14 / zoom;

  const hits = GS.vehicles.filter(v => {
    if (!v.position) return false;
    const dx = v.position.x - clickDataX;
    const dy = v.position.y - clickDataY;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
  });

  if (hits.length === 0) return;

  if (hits.length === 1) {
    openVehicleInfoPanel(hits[0].id);
    return;
  }

  // Multiple vehicles – show selection list
  const listHtml = hits.map(v => {
    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    return `<button class="btn btn-secondary w-full" onclick="closeModal();openVehicleInfoPanel('${v.id}')">
      ${cat.icon} ${v.name}
    </button>`;
  }).join('');
  openModal('Fahrzeuge auswählen', `<div class="flex flex-col gap-sm">${listHtml}</div>`);
}

// Handle mouse-wheel zoom on the map screen canvas
function handleMapScreenWheel(e) {
  e.preventDefault();
  if (e.deltaY < 0 && GS.ui.mapZoom < 2) setMapZoom(2);
  else if (e.deltaY > 0 && GS.ui.mapZoom > 1) setMapZoom(1);
}

// ── Canvas map renderer ──────────────────────────────────────
// opts: { zoom: 1|2, center: {x,y} }  (optional; defaults to zoom=1, center=map center)
function drawMapOnCanvas(canvas, highlightCityIds, vehicles, opts) {
  canvas.width  = canvas.clientWidth  || 800;
  canvas.height = Math.round(canvas.width * 0.65);

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // ── Zoom / pan transform ──────────────────────────────────
  const zoom    = (opts && opts.zoom)   ? opts.zoom   : 1;
  const center  = (opts && opts.center) ? opts.center : { x: 400, y: 260 };
  const viewW   = 800 / zoom;
  const viewH   = 520 / zoom;
  const offsetX = Math.max(0, Math.min(800 - viewW, center.x - viewW / 2));
  const offsetY = Math.max(0, Math.min(520 - viewH, center.y - viewH / 2));

  function toX(dx) { return (dx - offsetX) / viewW * W; }
  function toY(dy) { return (dy - offsetY) / viewH * H; }

  // ── Background ────────────────────────────────────────────
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, W, H);

  // ── Subtle grid ───────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,.02)';
  ctx.lineWidth = 1;
  const gridStep = 50;
  for (let gx = 0; gx <= 800; gx += gridStep) {
    const px = toX(gx);
    if (px < 0 || px > W) continue;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
  }
  for (let gy = 0; gy <= 520; gy += gridStep) {
    const py = toY(gy);
    if (py < 0 || py > H) continue;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
  }

  // ── Roads – layered rendering ─────────────────────────────
  const autobahn = DATA.CONNECTIONS.filter(c => c[3] === 'a');
  const national = DATA.CONNECTIONS.filter(c => c[3] === 'b');

  // Build highway-junction set: cities with ≥3 Autobahn connections
  const autoCount = {};
  for (const [a, b] of autobahn) {
    autoCount[a] = (autoCount[a] || 0) + 1;
    autoCount[b] = (autoCount[b] || 0) + 1;
  }

  // Layer 1: Bundesstraßen – only at zoom 2
  if (zoom >= 2) {
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,190,40,0.45)';
    ctx.lineWidth = Math.max(1, 1.5 * zoom);
    for (const [a, b] of national) {
      const ca = cityById[a], cb = cityById[b];
      if (!ca || !cb) continue;
      ctx.beginPath();
      ctx.moveTo(toX(ca.x), toY(ca.y));
      ctx.lineTo(toX(cb.x), toY(cb.y));
      ctx.stroke();
    }
  }

  // Layer 2a: Autobahnen – wide blue outer line (always visible)
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(30,100,210,0.75)';
  ctx.lineWidth = Math.max(1.5, 3 * Math.min(zoom, 1.5));
  for (const [a, b] of autobahn) {
    const ca = cityById[a], cb = cityById[b];
    if (!ca || !cb) continue;
    ctx.beginPath();
    ctx.moveTo(toX(ca.x), toY(ca.y));
    ctx.lineTo(toX(cb.x), toY(cb.y));
    ctx.stroke();
  }
  // Layer 2b: white center dash line on Autobahnen
  ctx.strokeStyle = 'rgba(200,220,255,0.5)';
  ctx.lineWidth = Math.max(0.5, 0.8 * Math.min(zoom, 1.5));
  ctx.setLineDash([8, 6]);
  for (const [a, b] of autobahn) {
    const ca = cityById[a], cb = cityById[b];
    if (!ca || !cb) continue;
    ctx.beginPath();
    ctx.moveTo(toX(ca.x), toY(ca.y));
    ctx.lineTo(toX(cb.x), toY(cb.y));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Draw highlight route ───────────────────────────────────
  if (highlightCityIds && highlightCityIds.length > 1) {
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth   = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < highlightCityIds.length; i++) {
      const c = cityById[highlightCityIds[i]];
      if (!c) continue;
      if (i === 0) ctx.moveTo(toX(c.x), toY(c.y));
      else ctx.lineTo(toX(c.x), toY(c.y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Draw vehicle routes ────────────────────────────────────
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
        if (!started) { ctx.moveTo(toX(c.x), toY(c.y)); started = true; }
        else ctx.lineTo(toX(c.x), toY(c.y));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ── Highway junction nodes (diamond on cities with ≥3 Autobahn links) ──
  for (const city of DATA.CITIES) {
    if ((autoCount[city.id] || 0) < 3) continue;
    const cx = toX(city.x), cy = toY(city.y);
    if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
    const r = Math.max(3, 4 * Math.min(zoom, 1.5));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle   = 'rgba(30,100,210,0.9)';
    ctx.strokeStyle = 'rgba(200,220,255,0.8)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.rect(-r / 2, -r / 2, r, r);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ── Order destination icons at zoom 2 ─────────────────────
  if (zoom >= 2) {
    const iconR = Math.max(5, 6 * zoom);
    for (const order of GS.orders.active) {
      const targets = [
        { cityId: order.origin,      icon: '📦', bg: 'rgba(88,166,255,0.85)' },
        { cityId: order.destination, icon: '🏁', bg: 'rgba(63,185,80,0.85)'  },
      ];
      for (const { cityId, icon, bg } of targets) {
        const city = cityById[cityId];
        if (!city) continue;
        const cx = toX(city.x), cy = toY(city.y);
        if (cx < -20 || cx > W + 20 || cy < -20 || cy > H + 20) continue;
        ctx.beginPath();
        ctx.arc(cx, cy - iconR - 2, iconR, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.font = `${Math.max(8, 10 * zoom)}px sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, cx, cy - iconR - 2);
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  // ── Cities ────────────────────────────────────────────────
  for (const city of DATA.CITIES) {
    const cx = toX(city.x);
    const cy = toY(city.y);
    if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
    const isHighlit = highlightCityIds && highlightCityIds.includes(city.id);
    const isHub = city.hub;
    const r = isHub ? Math.max(3, 4 * Math.min(zoom, 1.5)) : Math.max(2, 2.5 * Math.min(zoom, 1.5));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isHighlit ? '#e94560' : isHub ? '#58a6ff' : 'rgba(255,255,255,.5)';
    ctx.fill();

    const showLabel = isHighlit || isHub || (zoom >= 2);
    if (showLabel) {
      ctx.fillStyle = isHighlit ? '#fff' : isHub ? '#cae3ff' : '#8b949e';
      ctx.font = `${isHighlit ? 700 : isHub ? 500 : 400} ${Math.max(8, Math.round(10 * Math.min(zoom, 1.5)))}px sans-serif`;
      ctx.fillText(city.name, cx + r + 2, cy + 4);
    }
  }

  // ── HQ icon at zoom 2 ─────────────────────────────────────
  if (zoom >= 2) {
    const hqCity = cityById[GS.company.hqCity || 'frankfurt'];
    if (hqCity) {
      const hx = toX(hqCity.x), hy = toY(hqCity.y);
      ctx.font = `${Math.max(12, 14 * Math.min(zoom, 1.5))}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏢', hx, hy - Math.max(8, 12 * Math.min(zoom, 1.5)));
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ── Vehicles ──────────────────────────────────────────────
  if (vehicles) {
    for (const v of vehicles) {
      if (!v.position) continue;
      const vx = toX(v.position.x);
      const vy = toY(v.position.y);
      if (vx < -10 || vx > W + 10 || vy < -10 || vy > H + 10) continue;
      const vr = Math.max(4, 5 * Math.min(zoom, 1.5));
      ctx.beginPath();
      ctx.arc(vx, vy, vr, 0, Math.PI * 2);
      ctx.fillStyle = v.status === 'driving' ? '#3fb950' : '#f85149';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ── Stop numbers (route planner) ──────────────────────────
  if (highlightCityIds) {
    highlightCityIds.forEach((cityId, i) => {
      const c = cityById[cityId];
      if (!c) return;
      const nr = Math.max(6, 7 * Math.min(zoom, 1.5));
      ctx.beginPath();
      ctx.arc(toX(c.x), toY(c.y), nr, 0, Math.PI * 2);
      ctx.fillStyle = '#e94560';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, 10 * Math.min(zoom, 1.5))}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, toX(c.x), toY(c.y));
      ctx.textAlign    = 'left';
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

  // Map canvas click (route planner)
  const mc = $('map-canvas');
  if (mc) mc.addEventListener('click', handleMapClick);

  // Map screen canvas – click for vehicle selection + wheel for zoom
  const msc = $('map-screen-canvas');
  if (msc) {
    msc.addEventListener('click', handleMapScreenClick);
    msc.addEventListener('wheel', handleMapScreenWheel, { passive: false });
  }

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
