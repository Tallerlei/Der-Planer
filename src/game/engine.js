import { DATA } from '../data.js';
import { GS, cityById } from '../state.js';
import { fmt, rand, randFloat, pick, uid } from '../utils.js';
import {
  TIME_COSTS, REFUEL_THRESHOLD, REFUEL_DURATION_MINUTES,
  RENDER_THROTTLE_MS, MINUTES_PER_TICK,
  ORDER_POOL_MULTIPLIER, MIN_ORDER_POOL, REP_TIER_MAX_WEIGHT, REQ_LABELS,
  FLEET_COMPATIBLE_ORDER_RATIO,
  BASE_MIN_KM_PRICE, BASE_MAX_KM_PRICE, CARGO_TYPE_KM_FACTORS,
} from '../constants.js';
import { getDistance, buildRouteStops, routeDistance } from '../routing.js';
import { addTransaction } from './finance.js';
import { createStaff, generateHireCandidates } from './staff.js';
import { createVehicle, updatePositionForVehicle, startOrderForVehicle, isVehicleReturningToBase, getVehicleEffectiveCapacity, getVehicleEffectiveRequirements } from './vehicles.js';
import { getReputationTier, canFulfillOrder, getFleetCapabilities } from './orders.js';
import { checkMarketEvents } from './events.js';
import { autoSave, loadGame } from './save.js';
import { showToast, showTimeAdvance, addLogEntry } from '../ui/notifications.js';
import { updateStatusBar } from '../ui/statusbar.js';
import { openModal, closeModal } from '../ui/modal.js';

// ── Renderer registry (avoids circular deps with UI modules) ─
const _renderers = {};
export function registerRenderer(name, fn) { _renderers[name] = fn; }
function _render(name) { if (_renderers[name]) _renderers[name](); }

function getCityName(id) { return cityById[id] ? cityById[id].name : id; }

// ── Per-client reputation helpers ────────────────────────────
export function getClientReputation(clientId) {
  return (GS.clientReputation && GS.clientReputation[clientId] !== undefined)
    ? GS.clientReputation[clientId] : 50;
}

export function changeClientReputation(clientId, delta) {
  if (!GS.clientReputation) GS.clientReputation = {};
  const current = getClientReputation(clientId);
  GS.clientReputation[clientId] = Math.max(0, Math.min(100, current + delta));
}

function clientRepCompletionGain(R) {
  return Math.max(1, Math.round(8 * Math.pow(1 - R / 100, 0.6)));
}

function clientRepExpiryLoss(R) {
  return Math.round(12 * Math.pow(R / 100, 0.5));
}

function ensureClientStats(clientId) {
  if (!GS.clientStats) GS.clientStats = {};
  if (!GS.clientStats[clientId]) {
    GS.clientStats[clientId] = { offered: 0, accepted: 0, completed: 0, failed: 0 };
  }
}

/** Records a daily snapshot of company and per-client reputation into GS.reputationHistory.
 *  Keeps the last 30 entries so the dashboard can show a 30-day trend. */
export function recordReputationSnapshot() {
  if (!GS.reputationHistory) GS.reputationHistory = [];
  const clients = {};
  if (GS.clientReputation) {
    for (const [id, rep] of Object.entries(GS.clientReputation)) {
      clients[id] = rep;
    }
  }
  GS.reputationHistory.push({
    day: GS.time.day,
    month: GS.time.month,
    year: GS.time.year,
    company: GS.company.reputation || 50,
    clients,
  });
  if (GS.reputationHistory.length > 30) {
    GS.reputationHistory.splice(0, GS.reputationHistory.length - 30);
  }
}

// ── Timestamp helpers ────────────────────────────────────────
function currentTimeSnapshot() {
  const { day, month, year, hour, minute } = GS.time;
  return { day, month, year, hour, minute };
}

function _fmtTS(ts) {
  if (!ts) return '–';
  return `${fmt.date(ts.day, ts.month, ts.year)} ${fmt.time(ts.hour, ts.minute)}`;
}

function _addDaysToDate(ts, days) {
  const baseDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let { day, month, year, hour, minute } = { ...ts };
  day += days;
  while (true) {
    const febDays = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28;
    const monthDays = month === 2 ? febDays : baseDays[month];
    if (day <= monthDays) break;
    day -= monthDays;
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return { day, month, year, hour, minute };
}

// ── Order failure modal queue ────────────────────────────────
const _failureQueue = [];
let _failureModalOpen = false;

function _showNextFailureModal() {
  if (_failureModalOpen || _failureQueue.length === 0) return;

  const { order, failureType, penaltyAmount } = _failureQueue.shift();
  _failureModalOpen = true;

  const prevSpeed  = GS.speed;
  setSpeed(0);

  const originName = getCityName(order.origin);
  const destName   = getCityName(order.destination);
  const wt         = fmt.weight(order.weight);

  let title, body;

  if (failureType === 'expired') {
    const repLoss = clientRepExpiryLoss(getClientReputation(order.clientId));
    title = '❌ Auftrag abgelaufen';
    body = `
      <div class="failure-modal">
        <div class="failure-header">
          <strong>${order.clientName}</strong>
          <div class="text-sm text-muted">${order.cargoDesc} · ${wt} &nbsp;|&nbsp; ${originName} → ${destName}</div>
        </div>
        <table class="failure-timeline">
          <tr><td>📬 Auftrag erhalten</td><td>${_fmtTS(order.receivedAt)}</td></tr>
          <tr class="tl-miss"><td>✅ Angenommen</td><td><span class="text-muted">–</span></td></tr>
          <tr class="tl-fail"><td>⏰ Abgelaufen</td><td>${_fmtTS(order.expiredAt)}</td></tr>
        </table>
        <div class="failure-impact">
          <div class="failure-impact-row"><span>💸 Entgangener Wert</span><span class="fi-value text-danger">${fmt.money(order.value)}</span></div>
          <div class="failure-impact-row"><span>📉 Kundenzufriedenheit</span><span class="fi-value text-danger">−${repLoss} Punkte</span></div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Schließen</button></div>
      </div>`;
  } else {
    const deadlineAt     = order.receivedAt ? _addDaysToDate(order.receivedAt, order.deadlineDays) : null;
    const deadlineMinute = (order.receivedMinute || 0) + order.deadlineDays * 1440;
    const minutesLate    = (order.completedMinute || 0) - deadlineMinute;
    const hoursLate      = Math.floor(minutesLate / 60);
    const minsLatePart   = minutesLate % 60;
    const lateStr        = hoursLate > 0
      ? `+${hoursLate} Std. ${minsLatePart} Min. verspätet`
      : `+${minsLatePart} Min. verspätet`;

    title = '⚠️ Lieferung verspätet';
    body = `
      <div class="failure-modal">
        <div class="failure-header">
          <strong>${order.clientName}</strong>
          <div class="text-sm text-muted">${order.cargoDesc} · ${wt} &nbsp;|&nbsp; ${originName} → ${destName}</div>
        </div>
        <table class="failure-timeline">
          <tr><td>📬 Auftrag erhalten</td><td>${_fmtTS(order.receivedAt)}</td></tr>
          <tr><td>✅ Angenommen</td><td>${_fmtTS(order.acceptedAt)}</td></tr>
          ${order.pickedUpAt ? `<tr><td>📦 Ware abgeholt</td><td>${_fmtTS(order.pickedUpAt)}</td></tr>` : ''}
          <tr class="tl-warn"><td>📅 Deadline</td><td>${_fmtTS(deadlineAt)}</td></tr>
          <tr class="tl-fail"><td>🚚 Geliefert</td><td>${_fmtTS(order.completedAt)} <span class="text-danger text-sm">(${lateStr})</span></td></tr>
        </table>
        <div class="failure-impact">
          <div class="failure-impact-row"><span>Auftragswert</span><span class="fi-value">${fmt.money(order.value)}</span></div>
          <div class="failure-impact-row"><span>Vertragsstrafe</span><span class="fi-value text-danger">−${fmt.money(penaltyAmount)}</span></div>
          <div class="failure-impact-row fi-total"><span><strong>Ausgezahlt</strong></span><span class="fi-value"><strong>${fmt.money(order.finalValue)}</strong></span></div>
          <div class="failure-impact-row"><span>📉 Kundenzufriedenheit</span><span class="fi-value text-danger">−2 Punkte</span></div>
          <div class="failure-impact-row"><span>📉 Unternehmensansehen</span><span class="fi-value text-danger">−3 Punkte</span></div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Schließen</button></div>
      </div>`;
  }

  openModal(title, body, () => {
    _failureModalOpen = false;
    if (prevSpeed !== 0) setSpeed(prevSpeed);
    // Brief delay to allow modal fade-out animation (0.15s) before showing the next one
    setTimeout(_showNextFailureModal, 200);
  });
}

function _enqueueOrderFailure(order, failureType, penaltyAmount = 0) {
  _failureQueue.push({ order, failureType, penaltyAmount });
  _showNextFailureModal();
}

// ── Game loop ────────────────────────────────────────────────
let loopInterval = null;

export function startLoop() {
  if (loopInterval) clearInterval(loopInterval);
  loopInterval = setInterval(gameTick, Math.round(1000 / Math.max(1, GS.speed)));
}

export function gameTick() {
  if (GS.paused) return;
  advanceGameTime(MINUTES_PER_TICK);
}

export function setSpeed(s) {
  GS.speed = s;
  GS.paused = (s === 0);
  startLoop();
  document.querySelectorAll('.speed-btn[data-speed]').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.speed) === s);
  });
}

export function jumpToNextEvent() {
  if (!GS.started) return;

  const drivingVehicles = GS.vehicles.filter(v => v.status === 'driving');
  if (drivingVehicles.length === 0) {
    showToast('Keine Fahrzeuge unterwegs', 'info');
    return;
  }

  let minMinutes = Infinity;

  for (const v of drivingVehicles) {
    const stops = v.route && v.route.stops;
    if (!stops || stops.length < 2) continue;

    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    if (!cat) continue;

    const speedKmH = cat.speed * GS.market.speedMod;
    const kmPerMinute = speedKmH / 60;
    if (kmPerMinute <= 0) continue;

    const idx = v.route.currentStopIndex;

    // Find the next meaningful stop (delivery or return to base; skip pickups)
    let targetIdx = -1;
    for (let i = idx + 1; i < stops.length; i++) {
      const action = stops[i].action;
      if (action === 'delivery' || action === 'return') {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx < 0) continue;

    let minutes = 0;

    // Account for an active refuel pause (vehicle is currently stopped)
    if ((v.refuelPauseMinutes || 0) > 0) {
      minutes += v.refuelPauseMinutes;
    }

    // Remaining distance on the current partial leg
    const from = stops[idx];
    const nextStop = stops[idx + 1];
    if (!from || !nextStop) continue;

    const legDist = getDistance(from.cityId, nextStop.cityId);
    if (legDist <= 0 && targetIdx === idx + 1) {
      // Already at the target stop – event is essentially now
      minMinutes = 0;
      break;
    }
    const legKmDone    = (v.route.progressPct / 100) * legDist;
    const legRemaining = legDist - legKmDone;
    minutes += legRemaining / kmPerMinute;

    // Sum full legs between the next stop and the target stop
    for (let i = idx + 1; i < targetIdx; i++) {
      minutes += getDistance(stops[i].cityId, stops[i + 1].cityId) / kmPerMinute;
    }

    if (minutes < minMinutes) minMinutes = minutes;
  }

  if (!isFinite(minMinutes) || minMinutes < 0) return;

  // Advance at least 1 minute, always round up to ensure the event is reached
  const minutesToAdvance = Math.max(1, Math.ceil(minMinutes));
  advanceGameTime(minutesToAdvance);
}

// ── Central time advancement ─────────────────────────────────
export function advanceGameTime(minutes, label) {
  if (!GS.started) return;

  let actualMinutes = minutes;
  if (label) {
    const mod = (DATA.DIFFICULTY[GS.company.difficulty] || {}).timeCostMod || 1.0;
    actualMinutes = Math.max(1, Math.round(minutes * mod));
  }

  const prevTotal = GS.time.totalMinutes;
  GS.time.totalMinutes += actualMinutes;

  const totalMinInDay = GS.time.totalMinutes % 1440;
  GS.time.hour   = Math.floor(totalMinInDay / 60);
  GS.time.minute = totalMinInDay % 60;

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
    recordReputationSnapshot();
    autoSave();
  }

  tickVehicles(actualMinutes);

  if (GS.time.totalMinutes - GS.ui.lastOrderCheckMin >= rand(120, 240)) {
    GS.ui.lastOrderCheckMin = GS.time.totalMinutes;
    generateOrders();
  }

  if (GS.time.totalMinutes - GS.ui.lastEventCheckMin >= 1440) {
    GS.ui.lastEventCheckMin = GS.time.totalMinutes;
    checkMarketEvents();
  }

  updateStatusBar();

  if (label) showTimeAdvance(actualMinutes, label);

  const now = Date.now();
  const shouldRender = label || !GS.ui.lastRenderMs || (now - GS.ui.lastRenderMs) >= RENDER_THROTTLE_MS;
  if (shouldRender) {
    GS.ui.lastRenderMs = now;
    const screen = GS.ui.currentScreen;
    if (screen === 'fleet')    _render('fleet');
    if (screen === 'orders')   _render('orders');
    if (screen === 'map')      _render('map');
    if (screen === 'finance')  _render('finance');
    if (screen === 'office')   _render('office');
  }
}

// ── Monthly processing ────────────────────────────────────────
export function processMonthEnd() {
  let totalSalary = 0;
  for (const s of GS.staff) {
    totalSalary += s.salary;
    s.satisfaction = Math.max(40, s.satisfaction - rand(0, 3));
  }
  if (totalSalary > 0) addTransaction('Gehälter Monat ' + GS.time.month, -totalSalary);

  let totalMaint = 0;
  for (const v of GS.vehicles) {
    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    if (!cat) continue;
    const mechanic = GS.staff.find(s => s.role === 'mechanic');
    const discount = mechanic ? 0.15 * (mechanic.skill / 5) : 0;
    const cost = cat.maintenanceCostPerMonth * (1 - discount);
    totalMaint += cost;
    v.health = Math.min(100, v.health + 5);
  }
  if (totalMaint > 0) addTransaction('Fahrzeugwartung', -Math.round(totalMaint));

  GS.finance.monthRevenue  = 0;
  GS.finance.monthExpenses = 0;

  if (GS.finance.balance < 0) showToast('⚠️ Achtung: Ihr Kontostand ist negativ!', 'danger');
}

// ── Vehicle movement ─────────────────────────────────────────
export function tickVehicles(minutesPassed) {
  for (const v of GS.vehicles) {
    if (v.status !== 'driving') continue;
    const stops = v.route.stops;
    if (!stops || stops.length < 2) { v.status = 'idle'; continue; }

    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    const speedKmH = cat.speed * GS.market.speedMod;
    const kmPerMinute = speedKmH / 60;

    let remainingMinutes = minutesPassed;

    while (remainingMinutes > 0 && v.status === 'driving') {
      if ((v.refuelPauseMinutes || 0) > 0) {
        const pause = Math.min(v.refuelPauseMinutes, remainingMinutes);
        remainingMinutes -= pause;
        v.refuelPauseMinutes -= pause;
        if (v.refuelPauseMinutes <= 0) {
          const litres = cat.fuelCapacity - v.fuel;
          const cost = litres * GS.market.fuelPrice;
          addTransaction(`Tankstopp ${v.name}`, -cost);
          v.fuel = cat.fuelCapacity;
          addLogEntry(`⛽ ${v.name}: Getankt`, 'info');
        }
        continue;
      }

      if (v.fuel < cat.fuelCapacity * REFUEL_THRESHOLD) {
        v.refuelPauseMinutes = REFUEL_DURATION_MINUTES;
        addLogEntry(`⛽ ${v.name}: Tankstopp (${REFUEL_DURATION_MINUTES} Min)`, 'info');
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
      const kmActual = Math.min(kmThisTick, legRemaining);

      const fuelUsed = (kmActual / 100) * cat.fuelConsumption;
      v.fuel = Math.max(0, v.fuel - fuelUsed);
      v.odometer += kmActual;
      GS.stats.kmDriven += kmActual;
      v.health = Math.max(0, v.health - kmActual * 0.0001);

      if (kmThisTick >= legRemaining) {
        remainingMinutes -= (legRemaining / kmPerMinute);
        v.route.progressPct = 0;
        v.currentCity = to.cityId;
        v.route.coveredDistance += legDist;
        v.route.currentStopIndex++;

        processStopAction(v, to);

        // If processStopAction replaced the route (next order started directly),
        // break so the new route takes effect from the next iteration
        if (v.route.stops !== stops) break;

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

export function processStopAction(v, stop) {
  if (!stop.action || stop.action === 'depart' || stop.action === 'return' || stop.action === 'transit') return;

  const order = GS.orders.active.find(o => o.id === stop.orderId);
  if (!order) return;

  if (stop.action === 'pickup') {
    order.pickedUpAt = currentTimeSnapshot();
    showToast(`${v.name}: Ware abgeholt in ${getCityName(stop.cityId)}`, 'info');
  } else if (stop.action === 'delivery') {
    const remaining = order.remainingWeight !== undefined ? order.remainingWeight : order.weight;
    const deliveredWeight = Math.min(getVehicleEffectiveCapacity(v), remaining);
    order.remainingWeight = Math.max(0, remaining - deliveredWeight);
    order.tripsCompleted  = (order.tripsCompleted || 0) + 1;

    v.orderQueue = v.orderQueue || [];
    if (order.remainingWeight <= 0) {
      completeOrder(order, v);
    } else {
      showToast(
        `${v.name}: Teillieferung ${fmt.weight(deliveredWeight)} – noch ${fmt.weight(order.remainingWeight)} ausstehend`,
        'info'
      );
      v.orderQueue.unshift(order.id);
    }

    // After delivery: if queued orders exist, start next order directly
    // without returning to HQ first
    if (v.orderQueue.length > 0) {
      const nextOrderId = v.orderQueue.shift();
      const nextOrder = GS.orders.active.find(o => o.id === nextOrderId);
      if (nextOrder) {
        startOrderForVehicle(v, nextOrder);
      } else {
        showToast(`${v.name}: Nächster Auftrag nicht mehr verfügbar`, 'warning');
      }
    }
  }
}

export function arriveAtFinalStop(v) {
  v.status = 'idle';
  v.route.stops = [];
  v.route.currentStopIndex = 0;
  v.route.progressPct = 0;

  const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
  const litresNeeded = cat.fuelCapacity - v.fuel;
  if (litresNeeded > 0) {
    const cost = litresNeeded * GS.market.fuelPrice;
    addTransaction(`Kraftstoff ${v.name}`, -cost);
    v.fuel = cat.fuelCapacity;
  }

  v.orderQueue = v.orderQueue || [];
  if (v.orderQueue.length > 0) {
    const nextOrderId = v.orderQueue.shift();
    const nextOrder = GS.orders.active.find(o => o.id === nextOrderId);
    if (nextOrder) startOrderForVehicle(v, nextOrder);
  }

  _render('fleet');
}

export function completeOrder(order, vehicle) {
  const now = GS.time.totalMinutes;
  const idx = GS.orders.active.findIndex(o => o.id === order.id);
  if (idx < 0) return;

  const deadlineMinute = order.receivedMinute + order.deadlineDays * 1440;
  const onTime = now <= deadlineMinute;
  let finalValue = order.value;

  let penaltyAmount = 0;
  if (onTime) {
    finalValue += order.bonus;
    showToast(`✅ Lieferung abgeschlossen: +${fmt.money(finalValue)}`, 'success');
  } else {
    const hoursLate = Math.floor((now - deadlineMinute) / 60);
    penaltyAmount = Math.min(order.value * 0.5, order.penalty * hoursLate);
    finalValue = Math.max(0, order.value - penaltyAmount);
    showToast(`⚠️ Lieferung verspätet: +${fmt.money(finalValue)} (Strafe: ${fmt.money(penaltyAmount)})`, 'warning');
  }

  order.status = 'completed';
  order.completedMinute = now;
  order.completedAt = currentTimeSnapshot();
  order.finalValue = finalValue;

  GS.orders.active.splice(idx, 1);
  GS.orders.completed.unshift(order);
  GS.stats.ordersCompleted++;

  ensureClientStats(order.clientId);
  if (onTime) {
    GS.clientStats[order.clientId].completed++;
    changeClientReputation(order.clientId, clientRepCompletionGain(getClientReputation(order.clientId)));
  } else {
    GS.clientStats[order.clientId].failed++;
    changeClientReputation(order.clientId, -2);
    _enqueueOrderFailure(order, 'late', penaltyAmount);
  }

  addTransaction(
    `Lieferung: ${order.clientName} (${getCityName(order.origin)}→${getCityName(order.destination)})`,
    finalValue
  );

  const oldRep = GS.company.reputation || 50;
  if (onTime) GS.company.reputation = Math.min(100, oldRep + 2);
  else GS.company.reputation = Math.max(0, oldRep - 3);
  checkReputationTierChange(oldRep, GS.company.reputation);

  updateStatusBar();
}

// ── Order generation ─────────────────────────────────────────
export function generateOrders() {
  const diff = DATA.DIFFICULTY[GS.company.difficulty];
  const volMod = GS.market.orderVolumeMod * diff.orderFrequency;

  const usableVehicles = Math.max(1, GS.vehicles.filter(v => v.status !== 'broken').length);
  const maxAvailable = Math.max(MIN_ORDER_POOL, Math.ceil(usableVehicles * ORDER_POOL_MULTIPLIER));
  if (GS.orders.available.length >= maxAvailable) return;
  const canGenerate = maxAvailable - GS.orders.available.length;
  const count = Math.min(canGenerate, Math.round(rand(3, 8) * volMod));
  if (count <= 0) return;

  const repTier = getReputationTier(GS.company.reputation || 50);
  const tierMaxWeight = REP_TIER_MAX_WEIGHT[repTier];
  const eligibleTemplates = DATA.ORDER_TEMPLATES.filter(t => t.minWeight <= tierMaxWeight);
  if (eligibleTemplates.length === 0) return;

  // Determine which templates produce single-trip feasible orders for the current fleet
  const { maxCapacity, metReqs } = getFleetCapabilities();
  const feasibleTemplates = maxCapacity > 0
    ? eligibleTemplates.filter(t =>
        t.minWeight <= maxCapacity &&
        t.requirements.every(r => metReqs.has(r))
      )
    : [];

  // Guarantee at least FLEET_COMPATIBLE_ORDER_RATIO of each batch (min 1) are single-trip feasible
  const guaranteedCount = feasibleTemplates.length > 0
    ? Math.max(1, Math.floor(count * FLEET_COMPATIBLE_ORDER_RATIO))
    : 0;

  for (let i = 0; i < count; i++) {
    const useFleetFit = i < guaranteedCount;
    const template = useFleetFit ? pick(feasibleTemplates) : pick(eligibleTemplates);
    const client   = pick(DATA.CLIENTS);
    const origins  = DATA.CITIES.filter(c => c.country === 'DE');
    const originC  = pick(origins);
    let destC;
    do { destC = pick(DATA.CITIES); } while (destC.id === originC.id);

    const dist    = getDistance(originC.id, destC.id);
    const maxW    = useFleetFit
      ? Math.min(template.maxWeight, maxCapacity)
      : Math.min(template.maxWeight, tierMaxWeight);
    const minTons = Math.ceil(template.minWeight / 1000);
    const maxTons = Math.max(minTons, Math.floor(maxW / 1000));
    const weight  = rand(minTons, maxTons) * 1000;
    const valueMod = GS.market.orderValueMod * diff.orderFrequency;
    const loyaltyBonus = getClientReputation(client.id) >= 75 ? 1.05 : 1.0;
    const freightFactor = CARGO_TYPE_KM_FACTORS[template.type] ?? 1.0;
    const baseKmPrice = randFloat(BASE_MIN_KM_PRICE, BASE_MAX_KM_PRICE);
    const baseVal = Math.round(baseKmPrice * dist * freightFactor * valueMod * loyaltyBonus);

    const r = Math.random();
    const channel = r < 0.5 ? 'phone' : r < 0.75 ? 'fax' : 'online';
    const isUrgent = Math.random() < 0.15;
    const urgencyFactor = isUrgent ? 1.4 : 1.0;
    const expiresInDays = rand(1, 2);
    const deadlineDays = isUrgent
      ? expiresInDays + 1
      : Math.max(rand(2, 5), expiresInDays + 1);

    ensureClientStats(client.id);
    GS.clientStats[client.id].offered++;

    GS.orders.available.push({
      id: uid(),
      clientId: client.id,
      clientName: client.name,
      industry: client.industry,
      origin: originC.id,
      destination: destC.id,
      cargoDesc: template.cargo,
      cargoType: template.type,
      weight,
      remainingWeight: weight,
      tripsCompleted: 0,
      requirements: [...template.requirements],
      value: Math.round(baseVal * urgencyFactor),
      penalty: Math.round(baseVal * 0.1 * DATA.DIFFICULTY[GS.company.difficulty].orderPenaltyMod),
      bonus: Math.round(baseVal * 0.08),
      deadlineDays,
      isUrgent,
      urgencyFactor,
      freightFactor,
      pricePerKm: baseKmPrice,
      expiresInDays,
      receivedMinute: GS.time.totalMinutes,
      receivedAt: currentTimeSnapshot(),
      channel,
      status: 'available',
      vehicleId: null,
      acceptedMinute: null,
      acceptedAt: null,
      pickedUpAt: null,
      completedMinute: null,
      completedAt: null,
      expiredAt: null,
      finalValue: null,
    });
  }

  _render('orders-badge');
  if (document.getElementById('order-list-available')) _render('orders');
}

export function injectTierOrders(tier, count) {
  const diff = DATA.DIFFICULTY[GS.company.difficulty];
  const tierMaxWeight = REP_TIER_MAX_WEIGHT[tier];
  const prevMaxWeight = tier > 1 ? REP_TIER_MAX_WEIGHT[tier - 1] : 0;
  const tierTemplates = DATA.ORDER_TEMPLATES.filter(t =>
    t.minWeight <= tierMaxWeight && t.maxWeight > prevMaxWeight
  );
  if (tierTemplates.length === 0) return;

  for (let i = 0; i < count; i++) {
    const template = pick(tierTemplates);
    const client   = pick(DATA.CLIENTS);
    const origins  = DATA.CITIES.filter(c => c.country === 'DE');
    const originC  = pick(origins);
    let destC;
    do { destC = pick(DATA.CITIES); } while (destC.id === originC.id);

    const dist   = getDistance(originC.id, destC.id);
    const minW   = Math.max(template.minWeight, prevMaxWeight + 1);
    const maxW   = Math.min(template.maxWeight, tierMaxWeight);
    const minTons = Math.ceil(minW / 1000);
    const maxTons = Math.max(minTons, Math.floor(maxW / 1000));
    const weight = rand(minTons, maxTons) * 1000;
    const valueMod = GS.market.orderValueMod * diff.orderFrequency;
    const loyaltyBonus = getClientReputation(client.id) >= 75 ? 1.05 : 1.0;
    const freightFactor = CARGO_TYPE_KM_FACTORS[template.type] ?? 1.0;
    const baseKmPrice = randFloat(BASE_MIN_KM_PRICE, BASE_MAX_KM_PRICE);
    const baseVal = Math.round(baseKmPrice * dist * freightFactor * valueMod * loyaltyBonus);
    const r = Math.random();
    const channel = r < 0.5 ? 'phone' : r < 0.75 ? 'fax' : 'online';
    const expiresInDaysTier = 2;
    const deadlineDaysTier = Math.max(rand(2, 5), expiresInDaysTier + 1);

    ensureClientStats(client.id);
    GS.clientStats[client.id].offered++;

    GS.orders.available.push({
      id: uid(),
      clientId: client.id,
      clientName: client.name,
      industry: client.industry,
      origin: originC.id,
      destination: destC.id,
      cargoDesc: template.cargo,
      cargoType: template.type,
      weight,
      remainingWeight: weight,
      tripsCompleted: 0,
      requirements: [...template.requirements],
      value: baseVal,
      penalty: Math.round(baseVal * 0.1 * diff.orderPenaltyMod),
      bonus: Math.round(baseVal * 0.08),
      deadlineDays: deadlineDaysTier,
      isUrgent: false,
      urgencyFactor: 1.0,
      freightFactor,
      pricePerKm: baseKmPrice,
      expiresInDays: expiresInDaysTier,
      receivedMinute: GS.time.totalMinutes,
      receivedAt: currentTimeSnapshot(),
      channel,
      status: 'available',
      vehicleId: null,
      acceptedMinute: null,
      acceptedAt: null,
      pickedUpAt: null,
      completedMinute: null,
      completedAt: null,
      expiredAt: null,
      finalValue: null,
    });
  }
  _render('orders-badge');
  if (document.getElementById('order-list-available')) _render('orders');
}

/**
 * Developer balancing tool – generates simulated orders and logs per-cargo-type
 * price statistics to the browser console.
 *
 * Call from DevTools: `import('/src/game/engine.js').then(m => m.runBalancingTest())`
 * or expose it via window in main.js for quick console access.
 *
 * Only uses static DATA (no GS state required). Safe to call at any time.
 * @param {number} [sampleSize=100] Number of simulated orders to generate.
 */
export function runBalancingTest(sampleSize = 100) {
  const typeStats = {};
  const allRates = [];

  for (let i = 0; i < sampleSize; i++) {
    const template = DATA.ORDER_TEMPLATES[Math.floor(Math.random() * DATA.ORDER_TEMPLATES.length)];
    const origins  = DATA.CITIES.filter(c => c.country === 'DE');
    const originC  = origins[Math.floor(Math.random() * origins.length)];
    let destC;
    do { destC = DATA.CITIES[Math.floor(Math.random() * DATA.CITIES.length)]; }
    while (destC.id === originC.id);

    const dist = getDistance(originC.id, destC.id);
    if (!dist || dist <= 0) continue;

    const freightFactor = CARGO_TYPE_KM_FACTORS[template.type] ?? 1.0;
    const baseKmPrice   = BASE_MIN_KM_PRICE + Math.random() * (BASE_MAX_KM_PRICE - BASE_MIN_KM_PRICE);
    const isUrgent      = Math.random() < 0.15;
    const urgencyFactor = isUrgent ? 1.4 : 1.0;
    const effectiveKmRate = baseKmPrice * freightFactor * urgencyFactor;

    if (!typeStats[template.type]) {
      typeStats[template.type] = { count: 0, sum: 0, min: Infinity, max: -Infinity };
    }
    const ts = typeStats[template.type];
    ts.count++;
    ts.sum += effectiveKmRate;
    if (effectiveKmRate < ts.min) ts.min = effectiveKmRate;
    if (effectiveKmRate > ts.max) ts.max = effectiveKmRate;
    allRates.push(effectiveKmRate);
  }

  const overallAvg = allRates.reduce((a, b) => a + b, 0) / (allRates.length || 1);
  const overallMin = Math.min(...allRates);
  const overallMax = Math.max(...allRates);

  console.group(`%c🔬 Balancing-Test: ${sampleSize} Aufträge`, 'font-weight:bold');
  console.log(`Basis: ${BASE_MIN_KM_PRICE}–${BASE_MAX_KM_PRICE} €/km`);
  console.log(`Gesamt – Ø ${overallAvg.toFixed(2)} €/km  |  Min ${overallMin.toFixed(2)}  |  Max ${overallMax.toFixed(2)}`);

  const rows = Object.entries(typeStats).map(([type, s]) => ({
    Typ: type,
    Faktor: `×${(CARGO_TYPE_KM_FACTORS[type] ?? 1).toFixed(1)}`,
    Anzahl: s.count,
    'Ø €/km': s.sum / s.count,
    'Min €/km': s.min,
    'Max €/km': s.max,
  }));
  console.table(rows);

  // ASCII histogram (bucket size 1 €/km, range 4–22)
  const buckets = Array(19).fill(0);
  for (const r of allRates) {
    const idx = Math.min(18, Math.max(0, Math.floor(r) - 4));
    buckets[idx]++;
  }
  const maxBucket = Math.max(...buckets);
  const barWidth = 30;
  console.log('\nHistogramm (€/km):');
  buckets.forEach((cnt, i) => {
    const label = `${(i + 4).toString().padStart(2)} €/km`;
    const bar   = '█'.repeat(Math.round((cnt / maxBucket) * barWidth));
    console.log(`  ${label} | ${bar} (${cnt})`);
  });
  console.groupEnd();
}

export function checkReputationTierChange(oldRep, newRep) {
  const oldTier = getReputationTier(oldRep);
  const newTier = getReputationTier(newRep);
  if (newTier > oldTier) {
    injectTierOrders(newTier, 2);
    showToast(`⭐ Bekanntheitsgrad Stufe ${newTier} erreicht – neue Aufträge verfügbar!`, 'success');
  }
  GS.company.reputationTier = newTier;
}

export function expireOrders() {
  const now = GS.time.totalMinutes;
  GS.orders.available = GS.orders.available.filter(order => {
    const ageMin = now - order.receivedMinute;
    if (ageMin > order.expiresInDays * 1440) {
      order.expiredAt = currentTimeSnapshot();
      order.status = 'expired';
      GS.orders.declined.unshift(order);
      ensureClientStats(order.clientId);
      GS.clientStats[order.clientId].failed++;
      changeClientReputation(order.clientId, -clientRepExpiryLoss(getClientReputation(order.clientId)));
      _enqueueOrderFailure(order, 'expired');
      return false;
    }
    return true;
  });
  _render('orders-badge');
}

// ── Order lifecycle ──────────────────────────────────────────
export function acceptOrder(orderId, vehicleId) {
  const idx = GS.orders.available.findIndex(o => o.id === orderId);
  if (idx < 0) return;
  const order = GS.orders.available[idx];

  const vehicle = GS.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) { showToast('Kein Fahrzeug ausgewählt.', 'warning'); return; }
  if (vehicle.status !== 'idle' && vehicle.status !== 'driving') {
    showToast('Fahrzeug ist nicht verfügbar.', 'warning'); return;
  }
  if (!vehicle.driverId) { showToast('Dem Fahrzeug ist kein Fahrer zugewiesen.', 'warning'); return; }

  const effectiveReqs = getVehicleEffectiveRequirements(vehicle);
  for (const req of order.requirements) {
    if (!effectiveReqs.includes(req)) {
      const reqLabel = REQ_LABELS[req] || req;
      showToast(`Fahrzeug erfüllt nicht: ${reqLabel}`, 'danger'); return;
    }
  }

  GS.orders.available.splice(idx, 1);
  order.status = 'accepted';
  order.vehicleId = vehicleId;
  order.acceptedMinute = GS.time.totalMinutes;
  order.acceptedAt = currentTimeSnapshot();
  GS.orders.active.push(order);

  ensureClientStats(order.clientId);
  GS.clientStats[order.clientId].accepted++;

  if (vehicle.status === 'idle' || isVehicleReturningToBase(vehicle)) {
    startOrderForVehicle(vehicle, order);
    showToast(`Auftrag angenommen: ${order.clientName}`, 'success');
  } else {
    vehicle.orderQueue = vehicle.orderQueue || [];
    vehicle.orderQueue.push(order.id);
    const pos = vehicle.orderQueue.length;
    showToast(`Auftrag in Warteschlange (Position ${pos}): ${order.clientName}`, 'success');
  }

  advanceGameTime(TIME_COSTS.assignOrder, 'Auftragsübernahme');
  delete GS.ui.orderVehicleSelection[orderId];
  _render('orders-badge');
  if (document.getElementById('order-list-available')) _render('orders');
  if (document.getElementById('fleet-list')) _render('fleet');
}

export function declineOrder(orderId) {
  const idx = GS.orders.available.findIndex(o => o.id === orderId);
  if (idx < 0) return;
  const order = GS.orders.available.splice(idx, 1)[0];
  order.status = 'declined';
  GS.orders.declined.unshift(order);
  delete GS.ui.orderVehicleSelection[orderId];
  showToast('Auftrag abgelehnt.', 'warning');
  _render('orders-badge');
  if (document.getElementById('order-list-available')) _render('orders');
}

// ── Order queue management ────────────────────────────────────

/** Returns the orderId currently being actively executed by the vehicle
 *  (route has been built for it – it is NOT merely sitting in orderQueue). */
export function getVehicleActiveOrderId(vehicle) {
  if (!vehicle || vehicle.status !== 'driving' || !vehicle.route?.stops) return null;
  for (const stop of vehicle.route.stops) {
    if ((stop.action === 'pickup' || stop.action === 'delivery') && stop.orderId) {
      return stop.orderId;
    }
  }
  return null;
}

/** Returns true when the vehicle has already passed the pickup stop for orderId
 *  (cargo is physically on the vehicle and cannot be redirected). */
export function isCargoLoaded(vehicle, orderId) {
  if (!vehicle || vehicle.status !== 'driving' || !vehicle.route?.stops) return false;
  const stops = vehicle.route.stops;
  const pickupIdx = stops.findIndex(s => s.action === 'pickup' && s.orderId === orderId);
  if (pickupIdx < 0) return false;
  return vehicle.route.currentStopIndex > pickupIdx;
}

/** Validates that a target vehicle is capable and available for an order. */
function _validateVehicleForOrder(vehicle, order) {
  if (!vehicle) return 'Fahrzeug nicht gefunden.';
  if (vehicle.status !== 'idle' && vehicle.status !== 'driving') return 'Fahrzeug ist nicht verfügbar.';
  if (!vehicle.driverId) return 'Dem Fahrzeug ist kein Fahrer zugewiesen.';
  const cat = DATA.VEHICLES.find(c => c.id === vehicle.catalogId);
  for (const req of order.requirements) {
    if (!cat.requirements.includes(req)) return `Fahrzeug erfüllt nicht: ${REQ_LABELS[req] || req}`;
  }
  return null;
}

/**
 * Reassigns an order to a different vehicle.
 * Handles two cases:
 *   1. The order is sitting in a vehicle's orderQueue (not yet executing).
 *   2. The order is actively executing but cargo has NOT yet been picked up
 *      (vehicle is still on the way to the pickup city).
 */
export function reassignOrder(orderId, newVehicleId) {
  const order = GS.orders.active.find(o => o.id === orderId);
  if (!order) { showToast('Auftrag nicht gefunden.', 'warning'); return; }

  // Case 1: order is sitting in a vehicle's queue
  let currentVehicle = GS.vehicles.find(v =>
    v.orderQueue && v.orderQueue.includes(orderId)
  );
  let isActiveOrder = false;

  // Case 2: order is actively executing but cargo not yet picked up
  if (!currentVehicle) {
    const executingVehicle = GS.vehicles.find(v => getVehicleActiveOrderId(v) === orderId);
    if (executingVehicle) {
      if (isCargoLoaded(executingVehicle, orderId)) {
        showToast('Ladung wurde bereits abgeholt – Auftrag kann nicht mehr umgeleitet werden.', 'warning');
        return;
      }
      currentVehicle = executingVehicle;
      isActiveOrder = true;
    }
  }

  if (!currentVehicle) {
    showToast('Auftrag kann nicht umgeleitet werden.', 'warning');
    return;
  }

  if (currentVehicle.id === newVehicleId) {
    showToast('Auftrag ist bereits diesem Fahrzeug zugewiesen.', 'info');
    return;
  }

  const newVehicle = GS.vehicles.find(v => v.id === newVehicleId);
  const validationError = _validateVehicleForOrder(newVehicle, order);
  if (validationError) { showToast(validationError, 'danger'); return; }

  if (isActiveOrder) {
    // Abort the active route on the current vehicle.
    // If it has a valid queued order, start that; otherwise go idle.
    currentVehicle.orderQueue = currentVehicle.orderQueue || [];
    const nextOrderId = currentVehicle.orderQueue.shift();
    const nextOrder = nextOrderId ? GS.orders.active.find(o => o.id === nextOrderId) : null;
    if (nextOrder) {
      startOrderForVehicle(currentVehicle, nextOrder);
    } else {
      currentVehicle.status = 'idle';
      currentVehicle.route = { stops: [], currentStopIndex: 0, progressPct: 0, totalDistance: 0, coveredDistance: 0 };
    }
  } else {
    // Remove from current vehicle's queue
    currentVehicle.orderQueue = currentVehicle.orderQueue.filter(id => id !== orderId);
  }

  // Update primary vehicle reference on the order
  order.vehicleId = newVehicleId;

  // Assign to new vehicle
  if (newVehicle.status === 'idle') {
    startOrderForVehicle(newVehicle, order);
    showToast(`Auftrag umgeleitet zu ${newVehicle.name} – fährt sofort los.`, 'success');
  } else {
    newVehicle.orderQueue = newVehicle.orderQueue || [];
    newVehicle.orderQueue.push(orderId);
    showToast(`Auftrag umgeleitet zu ${newVehicle.name} (Warteschlange: Position ${newVehicle.orderQueue.length}).`, 'success');
  }

  advanceGameTime(TIME_COSTS.assignOrder, 'Auftragsumleitung');
  _render('orders');
  if (document.getElementById('fleet-list')) _render('fleet');
}

/**
 * Adds an additional vehicle to help deliver the remaining weight of an
 * active order (multi-vehicle distribution).
 * The order is considered complete once the total remaining weight reaches 0,
 * regardless of how many vehicles contributed.
 */
export function addVehicleToOrder(orderId, vehicleId) {
  const order = GS.orders.active.find(o => o.id === orderId);
  if (!order) { showToast('Auftrag nicht gefunden.', 'warning'); return; }
  if ((order.remainingWeight || 0) <= 0) { showToast('Auftrag ist bereits vollständig geliefert.', 'info'); return; }

  const vehicle = GS.vehicles.find(v => v.id === vehicleId);
  const validationError = _validateVehicleForOrder(vehicle, order);
  if (validationError) { showToast(validationError, 'danger'); return; }

  // Don't add the same vehicle twice for the same order
  const alreadyActive = getVehicleActiveOrderId(vehicle) === orderId;
  const alreadyQueued = (vehicle.orderQueue || []).includes(orderId);
  if (alreadyActive || alreadyQueued) {
    showToast(`${vehicle.name} transportiert diesen Auftrag bereits.`, 'info');
    return;
  }

  if (vehicle.status === 'idle') {
    startOrderForVehicle(vehicle, order);
    showToast(`${vehicle.name} unterstützt Auftrag – fährt sofort los.`, 'success');
  } else {
    vehicle.orderQueue = vehicle.orderQueue || [];
    vehicle.orderQueue.push(orderId);
    showToast(`${vehicle.name} unterstützt Auftrag (Warteschlange: Position ${vehicle.orderQueue.length}).`, 'success');
  }

  advanceGameTime(TIME_COSTS.assignOrder, 'Fahrzeugzuweisung');
  _render('orders');
  if (document.getElementById('fleet-list')) _render('fleet');
}

/**
 * Moves an order within a vehicle's orderQueue.
 * fromIdx and toIdx are zero-based positions within the queue array.
 */
export function moveOrderInQueue(vehicleId, fromIdx, toIdx) {
  const vehicle = GS.vehicles.find(v => v.id === vehicleId);
  if (!vehicle || !vehicle.orderQueue) return;
  const q = vehicle.orderQueue;
  if (fromIdx < 0 || fromIdx >= q.length || toIdx < 0 || toIdx >= q.length) return;
  const [removed] = q.splice(fromIdx, 1);
  q.splice(toIdx, 0, removed);
  _render('fleet');
  _render('orders');
}

export function declineUnfulfillableOrders() {
  const unfulfillable = GS.orders.available.filter(o => !canFulfillOrder(o).feasible);
  if (unfulfillable.length === 0) { showToast('Alle Aufträge sind erfüllbar.', 'info'); return; }
  openModal(
    'Aufträge ablehnen',
    `<p>${unfulfillable.length} Aufträge ablehnen, die nicht erfüllbar sind?</p>
     <div class="flex gap-sm" style="margin-top:1rem">
       <button class="btn btn-danger" onclick="confirmDeclineUnfulfillable()">Ablehnen</button>
       <button class="btn btn-secondary" onclick="closeModal()">Abbrechen</button>
     </div>`
  );
}

export function confirmDeclineUnfulfillable() {
  closeModal();
  const unfulfillable = GS.orders.available.filter(o => !canFulfillOrder(o).feasible);
  unfulfillable.forEach(o => {
    GS.orders.available.splice(GS.orders.available.indexOf(o), 1);
    o.status = 'declined';
    GS.orders.declined.unshift(o);
  });
  showToast(`${unfulfillable.length} Aufträge abgelehnt.`, 'warning');
  _render('orders-badge');
  if (document.getElementById('order-list-available')) _render('orders');
}

// ── Game init ─────────────────────────────────────────────────
export function startNewGame() {
  const nameEl = document.getElementById('company-name');
  const name  = nameEl ? nameEl.value.trim() || 'Meine Spedition' : 'Meine Spedition';
  const diff  = document.querySelector('.diff-option.selected')?.dataset.diff || 'normal';
  const mode  = document.querySelector('.mode-option.selected')?.dataset.mode || 'story';
  const diffConfig = DATA.DIFFICULTY[diff];

  GS.company.name               = name;
  GS.company.difficulty         = diff;
  GS.company.mode               = mode;
  GS.company.reputation         = 50;
  GS.company.hqCity             = 'frankfurt';
  GS.company.reputationTier     = getReputationTier(50);
  GS.company.werbevertrag_aktiv  = false;
  GS.company.werbevertrag_booster = 0.0;

  GS.finance.balance    = diffConfig.startMoney;
  GS.market.fuelPrice   = diffConfig.fuelPriceBase;
  GS.time               = { day: 1, month: 3, year: 1994, hour: 8, minute: 0, totalMinutes: 480 };

  GS.vehicles = [];
  GS.staff    = [];
  GS.orders   = { available: [], active: [], completed: [], declined: [] };
  GS.finance.transactions = [];
  GS.market.activeEvents  = [];
  GS.stats = { totalRevenue: 0, totalExpenses: 0, ordersCompleted: 0, ordersFailed: 0, kmDriven: 0 };
  GS.clientReputation = {};
  GS.clientStats      = {};

  const starterVan = createVehicle('transit', 'frankfurt');
  GS.vehicles.push(starterVan);

  const driver1 = createStaff('driver', 2);
  driver1.vehicleId = starterVan.id;
  starterVan.driverId = driver1.id;
  GS.staff.push(driver1);

  const operator = createStaff('operator', 2);
  GS.staff.push(operator);

  generateHireCandidates();
  generateOrders();

  GS.started = true;

  document.getElementById('status-bar').classList.add('visible');
  document.getElementById('sidebar').classList.add('visible');
  document.getElementById('main-layout').style.display = 'flex';
  document.getElementById('screen-menu').classList.remove('active');

  startLoop();
  _render('screen-show-office');
  showToast(`Willkommen, ${name}! Ihr Unternehmen startet heute.`, 'success');
  addTransaction('Startkapital', 0);
}

export function loadAndContinue() {
  if (!loadGame()) { showToast('Kein Spielstand gefunden.', 'danger'); return; }
  if (!GS.ui.mapZoom)      GS.ui.mapZoom      = 1;
  if (!GS.ui.mapCenter)    GS.ui.mapCenter    = { x: 400, y: 260 };
  if (!GS.company.hqCity)  GS.company.hqCity  = 'frankfurt';
  if (GS.company.werbevertrag_aktiv  === undefined) GS.company.werbevertrag_aktiv  = false;
  if (GS.company.werbevertrag_booster === undefined) GS.company.werbevertrag_booster = 0.0;
  if (!GS.company.reputationTier) GS.company.reputationTier = getReputationTier(GS.company.reputation || 50);
  if (!GS.clientReputation) GS.clientReputation = {};
  if (!GS.clientStats)      GS.clientStats      = {};
  GS.started = true;
  document.getElementById('status-bar').classList.add('visible');
  document.getElementById('sidebar').classList.add('visible');
  document.getElementById('main-layout').style.display = 'flex';
  document.getElementById('screen-menu').classList.remove('active');
  startLoop();
  _render('screen-show-office');
  showToast('Spielstand geladen.', 'success');
}

// ── Staff candidate refresh ───────────────────────────────────
export function refreshCandidates() {
  generateHireCandidates();
  if (GS.started) advanceGameTime(TIME_COSTS.refreshCand, 'Kandidatensuche');
  _render('personnel');
}
