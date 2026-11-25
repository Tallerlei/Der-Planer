import { $, fmt, findById } from '../utils.js';
import { DATA } from '../data.js';
import { GS, cityById, getCityName } from '../state.js';
import { TIME_COSTS, REQ_LABELS, BASE_MIN_KM_PRICE, BASE_MAX_KM_PRICE, CARGO_TYPE_KM_FACTORS } from '../constants.js';
import { canFulfillOrder, getFleetCapabilities, isOrderAvailable } from '../game/orders.js';
import {
  acceptOrder, declineOrder, declineUnfulfillableOrders, getClientReputation,
  getVehicleActiveOrderId, isCargoLoaded, dispatchTour,
  bidForContract, declineContractTender, TENDER_IGNORE_REP_LOSS,
} from '../game/engine.js';
import { isVehicleReturningToBase, getVehicleEffectiveCapacity, getVehicleEffectiveRequirements } from '../game/vehicles.js';
import { projectTour } from '../game/tours.js';
import { updateOrderBadge } from './statusbar.js';
import { getDistance, findShortestPath, routeDistance } from '../routing.js';
import { closeModal, openModal } from './modal.js';
import {
  BID_STRATEGIES, ensureContracts, ensureTenders, getContractReliability,
  getTenderWinChance,
} from '../game/contracts.js';
import { ensureTutorialState, getActiveTutorialStep } from '../game/tutorial.js';
import { emitProgressEvent } from '../game/progression.js';
import {
  getDriverByVehicle, getDriverRemainingMinutes,
  getOperatorTenderBonus, driverMeetsRequirements,
} from '../game/staff.js';

// ── Helpers ───────────────────────────────────────────────────

/** Converts a game totalMinutes value to a formatted date+time string (DD.MM.YYYY HH:MM).
 *  The game clock starts at 01.03.1994 (totalMinutes=0 → midnight of that day). */
function gameMinutesToDateTime(totalMin) {
  totalMin = Math.round(totalMin);
  const dayOffset = Math.floor(totalMin / 1440);
  const hour = Math.floor((totalMin % 1440) / 60);
  const mn   = totalMin % 60;
  let d = 1, mo = 3, y = 1994;
  for (let i = 0; i < dayOffset; i++) {
    d++;
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
    const dim = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo];
    if (d > dim) { d = 1; mo++; if (mo > 12) { mo = 1; y++; } }
  }
  return `${fmt.date(d, mo, y)} ${fmt.time(hour, mn)}`;
}

/** Returns { stars, cssClass } for the 5-band visual reputation indicator. */
function clientRepDisplay(rep) {
  if (rep <= 20) return { stars: '★☆☆☆☆', cssClass: 'rep-very-low' };
  if (rep <= 40) return { stars: '★★☆☆☆', cssClass: 'rep-low' };
  if (rep <= 60) return { stars: '★★★☆☆', cssClass: 'rep-mid' };
  if (rep <= 80) return { stars: '★★★★☆', cssClass: 'rep-high' };
  return { stars: '★★★★★', cssClass: 'rep-very-high' };
}

/**
 * Estimates the minutes until a vehicle can arrive at a given pickup city.
 * Handles idle, driving (returning to base), and driving-with-queue states.
 * Returns null if no estimate is possible.
 */
function _calcMinsUntilPickup(v, cat, pickupCityId) {
  const kmPerMin = (cat.speed * GS.market.speedMod) / 60;
  if (kmPerMin <= 0) return null;

  if (v.status === 'idle') {
    const startCity = v.currentCity || v.homeCity;
    return routeDistance(findShortestPath(startCity, pickupCityId).map(id => ({ cityId: id }))) / kmPerMin;
  }

  if (v.status === 'driving' && v.route?.stops?.length > 0) {
    // Time to finish the current route (vehicle returns to homeCity at the end)
    const stops = v.route.stops;
    const idx = v.route.currentStopIndex;
    let minsToRouteEnd = 0;
    if (idx < stops.length - 1) {
      const legDist = getDistance(stops[idx].cityId, stops[idx + 1].cityId);
      let km = legDist * (1 - (v.route.progressPct || 0) / 100);
      for (let i = idx + 1; i < stops.length - 1; i++) {
        km += getDistance(stops[i].cityId, stops[i + 1].cityId);
      }
      minsToRouteEnd = km / kmPerMin + (v.refuelPauseMinutes || 0);
    }

    // Add time for each queued order (home → pickup → delivery → home)
    let accMins = minsToRouteEnd;
    let fromCity = v.homeCity;
    for (const orderId of (v.orderQueue || [])) {
      const qOrder = findById(GS.orders.active, orderId);
      if (qOrder) {
        const d1 = routeDistance(findShortestPath(fromCity, qOrder.origin).map(id => ({ cityId: id })));
        const d2 = routeDistance(findShortestPath(qOrder.origin, qOrder.destination).map(id => ({ cityId: id })));
        const d3 = routeDistance(findShortestPath(qOrder.destination, v.homeCity).map(id => ({ cityId: id })));
        accMins += (d1 + d2 + d3) / kmPerMin;
        fromCity = v.homeCity;
      }
    }

    // Final travel from home to the order's pickup city
    return accMins + routeDistance(findShortestPath(fromCity, pickupCityId).map(id => ({ cityId: id }))) / kmPerMin;
  }

  return null;
}

/**
 * Formats an estimated arrival time (in minutes from now) as a compact string.
 * Returns 'sofort' for ≤0, 'HH:MM' for same game day, or 'DD.MM. HH:MM' otherwise.
 */
function _fmtPickupEta(etaMins) {
  if (etaMins === null || etaMins === undefined) return '';
  if (etaMins <= 0) return 'sofort';
  const arrivalTotal = GS.time.totalMinutes + etaMins;
  const currentDayOffset = Math.floor(GS.time.totalMinutes / 1440);
  const arrivalDayOffset = Math.floor(arrivalTotal / 1440);
  const arrivalHour = Math.floor((arrivalTotal % 1440) / 60);
  const arrivalMin  = Math.floor((arrivalTotal % 1440) % 60);
  if (currentDayOffset === arrivalDayOffset) {
    return fmt.time(arrivalHour, arrivalMin);
  }
  let d = 1, mo = 3, y = 1994;
  for (let i = 0; i < arrivalDayOffset; i++) {
    d++;
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
    const dim = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo];
    if (d > dim) { d = 1; mo++; if (mo > 12) { mo = 1; y++; } }
  }
  return `${String(d).padStart(2, '0')}.${String(mo).padStart(2, '0')}. ${fmt.time(arrivalHour, arrivalMin)}`;
}

const INDUSTRY_ICONS = {
  food: '🍎', building: '🏗️', hazmat: '⚠️', auto: '🚗', fuel: '⛽',
  tech: '💻', medical: '🏥', fashion: '👗', sports: '⚽',
  industrial: '🔧', paper: '📄', furniture: '🪑', general: '📦',
};

function _pathDistance(fromCity, toCity) {
  return routeDistance(findShortestPath(fromCity, toCity).map(cityId => ({ cityId })));
}

function _formatDuration(minutes) {
  const rounded = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (hours === 0) return `${remainder} Min`;
  return `${hours} Std${remainder ? ` ${remainder} Min` : ''}`;
}

function _formatMargin(minutes) {
  const rounded = Math.round(minutes || 0);
  return `${rounded >= 0 ? '+' : '−'}${_formatDuration(Math.abs(rounded))}`;
}

function _formatDeadlineStatus(stop) {
  if (stop.status === 'late') return `Verspätet ${_formatMargin(stop.marginMinutes)}`;
  if (stop.status === 'tight') return `Knapp ${_formatMargin(stop.marginMinutes)}`;
  return `Pünktlich ${_formatMargin(stop.marginMinutes)}`;
}

function _tourPlannerDraft() {
  if (!GS.ui.routeDraft) {
    GS.ui.routeDraft = { vehicleId: null, orderIds: [], returnToBase: false };
  }
  return GS.ui.routeDraft;
}

function _tourVehicles() {
  return GS.vehicles.filter(vehicle =>
    vehicle.status === 'idle' &&
    vehicle.driverId
  );
}

function _tourEligibleOrders(vehicle) {
  if (!vehicle) return [];
  const requirements = getVehicleEffectiveRequirements(vehicle);
  const capacity = getVehicleEffectiveCapacity(vehicle);
  return GS.orders.available.filter(order =>
    isOrderAvailable(order) &&
    order.weight <= capacity &&
    order.requirements.every(requirement => requirements.includes(requirement)) &&
    driverMeetsRequirements(getDriverByVehicle(vehicle), order.requirements)
  );
}

function _getTourProjection(vehicle, orders, returnToBase) {
  return projectTour(vehicle, orders, returnToBase);
}

function _renderTourPlanner() {
  const draft = _tourPlannerDraft();
  const vehicles = _tourVehicles();
  const vehicle = vehicles.find(item => item.id === draft.vehicleId) || vehicles[0] || null;
  if (vehicle) draft.vehicleId = vehicle.id;
  else draft.orderIds = [];

  const eligible = vehicle ? _tourEligibleOrders(vehicle) : [];
  draft.orderIds = draft.orderIds.filter(id => eligible.some(order => order.id === id));
  const selected = draft.orderIds
    .map(id => eligible.find(order => order.id === id))
    .filter(Boolean);
  const selectedIds = new Set(selected.map(order => order.id));
  const projection = vehicle && selected.length > 0
    ? _getTourProjection(vehicle, selected, draft.returnToBase)
    : null;
  const restMinutes = projection
    ? projection.rests.reduce((sum, rest) => sum + rest.duration, 0)
    : 0;

  const unselected = eligible
    .filter(order => !selectedIds.has(order.id))
    .sort((a, b) => (b.isTutorial ? 1 : 0) - (a.isTutorial ? 1 : 0));
  const guide = _tourTutorialGuide(vehicle, selected, unselected, eligible.length, projection);
  const plannerHtml = `
    <div class="tour-planner">
      ${guide.html}
      <div class="tour-planner-intro">
        Kombiniere mehrere Aufträge zu einer zusammenhängenden Fahrt. Die Reihenfolge entscheidet über
        Leerfahrten, Auslastung und das Endziel des Fahrzeugs.
      </div>

      <div class="tour-setup-grid">
        <label class="form-group">
          <span class="form-label">Fahrzeug</span>
          <select class="form-control" onchange="selectTourVehicle(this.value)" ${vehicles.length === 0 ? 'disabled' : ''}>
            ${vehicles.length === 0
              ? '<option>Kein bereites Fahrzeug mit Fahrer</option>'
              : vehicles.map(item => `
                  <option value="${item.id}" ${item.id === vehicle.id ? 'selected' : ''}>
                    ${item.name} · ${fmt.weight(getVehicleEffectiveCapacity(item))} · ${getCityName(item.currentCity)}
                    · ${Number.isFinite(getDriverByVehicle(item)?.restUntilMinute) ? `Ruhe bis ${gameMinutesToDateTime(getDriverByVehicle(item).restUntilMinute)}` : `Schicht: ${_formatDuration(getDriverRemainingMinutes(getDriverByVehicle(item)))} frei`}
                  </option>`).join('')}
          </select>
        </label>
        <label class="tour-return-option">
          <input type="checkbox" onchange="setTourReturn(this.checked)" ${draft.returnToBase ? 'checked' : ''}>
          <span>
            <strong>Danach zur Zentrale zurückkehren</strong>
            <small>Ohne Rückfahrt bleibt das Fahrzeug am letzten Ziel und kann von dort neue Ladung aufnehmen.</small>
          </span>
        </label>
      </div>

      <div class="tour-columns">
        <section class="tour-column">
          <div class="tour-column-title">📦 Frachtmarkt</div>
          ${unselected.length === 0
            ? '<div class="tour-empty">Keine weiteren passenden Aufträge.</div>'
            : unselected.map(order => {
                const fromCity = selected.length > 0
                  ? selected[selected.length - 1].destination
                  : vehicle?.currentCity;
                const deadhead = vehicle ? _pathDistance(fromCity, order.origin) : 0;
                const backload = deadhead <= 200 && selected.length > 0;
                return `
                  <button class="tour-cargo-option ${backload ? 'tour-cargo-backload' : ''} ${order.isContract ? 'tour-cargo-contract' : ''} ${order.isTutorial ? 'tour-cargo-training' : ''} ${guide.targetOrderId === order.id ? 'tutorial-target' : ''}"
                    onclick="toggleTourOrder('${order.id}')">
                    ${order.isTutorial ? '<span class="tour-training-label">🎓 Übungsauftrag</span>' : ''}
                    <span class="tour-cargo-route">${getCityName(order.origin)} → ${getCityName(order.destination)}</span>
                    <span>${order.clientName} · ${fmt.weight(order.weight)} · ${fmt.money(order.value)}</span>
                    <span class="${backload ? 'tour-backload-label' : ''}">
                      ${backload ? '↩ Rückladung · ' : ''}${deadhead === 0 ? 'direkt erreichbar' : `${fmt.km(deadhead)} Leerfahrt`}
                    </span>
                    <span class="tour-order-deadline">Frist: ${gameMinutesToDateTime(order.receivedMinute + order.deadlineDays * 1440)}</span>
                  </button>`;
              }).join('')}
        </section>

        <section class="tour-column tour-route-column">
          <div class="tour-column-title">🧭 Geplante Tour</div>
          ${selected.length === 0
            ? '<div class="tour-empty tour-empty-route">Wähle links mindestens einen Auftrag aus.</div>'
            : selected.map((order, index) => `
                <div class="tour-stop-card">
                  <div class="tour-stop-number">${index + 1}</div>
                  <div class="tour-stop-copy">
                    <strong>${getCityName(order.origin)} → ${getCityName(order.destination)}</strong>
                    <span>${order.cargoDesc} · ${fmt.money(order.value)}</span>
                    ${projection ? (() => {
                      const stop = projection.stops.find(item => item.order.id === order.id);
                      return stop ? `
                        <span class="tour-stop-eta ${stop.status}">
                          📍 ${gameMinutesToDateTime(stop.pickupMinute)}
                          · 🏁 ${gameMinutesToDateTime(stop.deliveryMinute)}
                          · ${_formatDeadlineStatus(stop)}
                        </span>` : '';
                    })() : ''}
                  </div>
                  <div class="tour-stop-actions">
                    <button class="btn btn-secondary btn-xs" ${index === 0 ? 'disabled' : ''}
                      onclick="moveTourOrder('${order.id}', -1)" title="Nach oben">▲</button>
                    <button class="btn btn-secondary btn-xs" ${index === selected.length - 1 ? 'disabled' : ''}
                      onclick="moveTourOrder('${order.id}', 1)" title="Nach unten">▼</button>
                    <button class="btn btn-danger btn-xs" onclick="toggleTourOrder('${order.id}')" title="Entfernen">✕</button>
                  </div>
                  <details class="tour-order-details">
                    <summary>Auftragsdetails</summary>
                    <div>
                      <span>Gewicht</span><strong>${fmt.weight(order.weight)}</strong>
                      <span>Vergütung</span><strong>${fmt.money(order.value)} + ${fmt.money(order.bonus || 0)} Bonus</strong>
                      <span>Annahme endet</span><strong>${gameMinutesToDateTime(order.receivedMinute + order.expiresInDays * 1440)}</strong>
                      <span>Lieferfrist</span><strong>${gameMinutesToDateTime(order.receivedMinute + order.deadlineDays * 1440)}</strong>
                      <span>Strafe</span><strong>${fmt.money(order.penalty || 0)} je Stunde</strong>
                      <span>Anforderungen</span><strong>${order.requirements.length ? order.requirements.map(req => REQ_LABELS[req] || req).join(', ') : 'keine'}</strong>
                    </div>
                  </details>
                </div>`).join('')}
          ${projection ? `
            <div class="tour-final-stop">🏁 Ende in ${getCityName(projection.finalCity)}</div>
            ${projection.hasDeadlineRisk ? `<div class="tour-risk-banner">⚠️ ${projection.stops.filter(stop => stop.status !== 'safe').length} Lieferfrist${projection.stops.filter(stop => stop.status !== 'safe').length === 1 ? '' : 'en'} ist knapp oder wird verfehlt.</div>` : ''}
            ${projection.rests.length > 0 ? `
              <div class="tour-rest-plan">
                <strong>⏸️ Pflichtpause im Tourenverlauf</strong>
                ${projection.rests.map(rest => `<span>${gameMinutesToDateTime(rest.startMinute)} – ${gameMinutesToDateTime(rest.endMinute)} · ${_formatDuration(rest.duration)} Ruhe</span>`).join('')}
              </div>` : ''}
            ${projection.postTourRestMinutes > 0 ? `
              <div class="tour-rest-plan">
                <strong>🌙 Nach Tourende</strong>
                <span>${_formatDuration(projection.postTourRestMinutes)} Ruhepause · Fahrer wieder verfügbar ${gameMinutesToDateTime(projection.availableMinute)}</span>
              </div>` : ''}
            <div class="tour-projection">
              <div><span>Beladen</span><strong>${fmt.km(projection.loadedKm)}</strong></div>
              <div><span>Leerfahrt</span><strong>${fmt.km(projection.emptyKm)}</strong></div>
              <div><span>Auslastung</span><strong>${projection.utilization} %</strong></div>
              <div><span>Reine Fahrt</span><strong>${_formatDuration(projection.drivingMinutes)}</strong></div>
              <div><span>Ruhezeit</span><strong>${_formatDuration(restMinutes)}</strong></div>
              <div><span>Gesamtdauer</span><strong>${_formatDuration(projection.durationMinutes)}</strong></div>
              <div><span>Umsatz + Bonus</span><strong class="text-success">${fmt.money(projection.revenue)}</strong></div>
              <div><span>Kraftstoffkosten</span><strong class="text-danger">${fmt.money(Math.round(projection.fuelCost))}</strong></div>
              <div><span>Deckungsbeitrag vor Fixkosten</span><strong class="${projection.projectedProfit >= 0 ? 'text-success' : 'text-danger'}">${fmt.money(Math.round(projection.projectedProfit))}</strong></div>
              <div><span>Fahrer danach</span><strong class="text-success">${_formatDuration(projection.remainingDrivingMinutes)} Schicht frei</strong></div>
              <div><span>Wieder verfügbar</span><strong>${gameMinutesToDateTime(projection.availableMinute)}</strong></div>
            </div>` : ''}
        </section>
      </div>

      <div class="modal-footer tour-planner-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Abbrechen</button>
        <button class="btn ${projection?.hasDeadlineRisk ? 'btn-warning' : 'btn-primary'} ${guide.highlightStart ? 'tutorial-target' : ''}" ${!projection ? 'disabled' : ''}
          onclick="dispatchPlannedTour()">
          🚚 Tour starten
        </button>
      </div>
    </div>`;
  openModal('🗺️ Tour planen', plannerHtml);
}

function _renderContractStrip() {
  const element = $('contract-strip');
  if (!element) return;
  const contracts = ensureContracts().filter(contract => contract.active !== false);
  if (contracts.length === 0) {
    element.innerHTML = '';
    element.style.display = 'none';
    return;
  }
  element.style.display = '';
  element.innerHTML = contracts.map(contract => {
    const reliability = getContractReliability(contract);
    const available = GS.orders.available.some(order => order.contractId === contract.id);
    const state = available
      ? 'Vertragsladung verfügbar'
      : `Nächste Ladung: ${gameMinutesToDateTime(contract.nextReleaseMinute)}`;
    return `
      <div class="contract-card ${reliability < 70 ? 'contract-card-risk' : ''}">
        <div class="contract-mark">📄</div>
        <div class="contract-copy">
          <span class="contract-eyebrow">Wochenvertrag</span>
          <strong>${contract.title}</strong>
          <span>${getCityName(contract.origin)} → ${getCityName(contract.destination)} · ${fmt.weight(contract.weight)} · alle ${Math.round((contract.periodMinutes || 7 * 1440) / 1440)} Tage · ${state}</span>
        </div>
        <div class="contract-health">
          <span>Zuverlässigkeit</span>
          <strong>${reliability} %</strong>
          <div class="contract-health-bar"><span style="width:${reliability}%"></span></div>
          <small>${contract.missedDeliveries} / ${contract.maxMisses || 3} Ausfälle</small>
        </div>
      </div>`;
  }).join('');
}

function _renderTenderStrip() {
  const element = $('tender-strip');
  if (!element) return;
  const tenders = ensureTenders().filter(tender => tender.status === 'open');
  if (tenders.length === 0) {
    element.innerHTML = '';
    element.style.display = 'none';
    return;
  }
  element.style.display = '';
  element.innerHTML = tenders.map(tender => `
    <button class="tender-card" onclick="openTenderModal('${tender.id}')">
      <span class="tender-icon">📨</span>
      <span class="tender-copy">
        <span class="contract-eyebrow">Vertragsausschreibung</span>
        <strong>${tender.title}</strong>
        <span>${tender.clientName} · ${tender.route} · ${fmt.weight(tender.weight)} · Ende in ${gameMinutesToDateTime(tender.expiresMinute)}</span>
      </span>
      <span class="tender-cta">Angebot abgeben →</span>
    </button>`).join('');
}

export function openTenderModal(tenderId) {
  const tender = ensureTenders().find(item => item.id === tenderId);
  if (!tender || tender.status !== 'open') return;
  emitProgressEvent('tutorial-action', { action: 'tender-opened' });
  const competitorQuote = Math.round(tender.baseValue * tender.competitorFactor);
  const capabilities = getFleetCapabilities();
  const canBid =
    tender.weight <= capabilities.maxCapacity &&
    tender.requirements.every(requirement => capabilities.metReqs.has(requirement)) &&
    (GS.company.reputation || 50) >= tender.minRep;
  const bidBlockReason = tender.weight > capabilities.maxCapacity
    ? `Deine größte verfügbare Nutzlast ist ${fmt.weight(capabilities.maxCapacity)} – benötigt werden ${fmt.weight(tender.weight)}.`
    : tender.requirements.some(requirement => !capabilities.metReqs.has(requirement))
      ? 'Deinem Fuhrpark fehlt die benötigte Sonderausrüstung.'
      : (GS.company.reputation || 50) < tender.minRep
        ? `Dieses Kundenbriefing erfordert mindestens ${tender.minRep} Ansehen.`
        : '';
  const html = `
    <div class="tender-dialog">
      <div class="tender-dialog-head">
        <span>📨</span>
        <div><h3>${tender.title}</h3><p>${tender.clientName} · ${tender.route}</p></div>
      </div>
      <div class="tender-facts">
        <div><span>Fracht</span><strong>${tender.cargo}</strong></div>
        <div><span>Gewicht</span><strong>${fmt.weight(tender.weight)}</strong></div>
        <div><span>Referenzwert</span><strong>${fmt.money(tender.baseValue)}</strong></div>
        <div><span>Hauptkonkurrent</span><strong>${tender.competitor}</strong></div>
        <div><span>Geschätztes Konkurrenzangebot</span><strong>${fmt.money(competitorQuote)}</strong></div>
        <div><span>Anforderungen</span><strong>${tender.requirements.length ? tender.requirements.map(req => REQ_LABELS[req] || req).join(', ') : 'Standardfracht'}</strong></div>
      </div>
      <p class="text-sm text-muted">Ein günstigeres Angebot gewinnt häufiger, senkt aber den wöchentlichen Erlös. Ansehen und deine Telefonzentrale verbessern jede Strategie.</p>
      ${bidBlockReason ? `<div class="tender-blocked">🔒 ${bidBlockReason}</div>` : ''}
      <div class="bid-options">
        ${Object.entries(BID_STRATEGIES).map(([id, strategy]) => {
          const chance = getTenderWinChance(tender, id, getOperatorTenderBonus());
          const bidValue = Math.round(tender.baseValue * strategy.factor);
          return `
            <button class="bid-option bid-option-${id}" ${canBid ? '' : 'disabled'}
              onclick="placeContractBid('${tender.id}', '${id}')">
              <span class="bid-title">${strategy.label}</span>
              <strong>${fmt.money(bidValue)}</strong>
              <span>${Math.round(chance * 100)} % Gewinnchance</span>
              <small>${strategy.factor < 1 ? 'Niedrigere Marge, sehr wettbewerbsfähig' : strategy.factor > 1 ? 'Hohe Marge, anspruchsvoller Zuschlag' : 'Abgewogenes Verhältnis von Preis und Chance'}</small>
            </button>`;
        }).join('')}
      </div>
      <div class="tender-decline">
        <p class="text-sm text-muted">Angebotsfrist bis ${gameMinutesToDateTime(tender.expiresMinute)}. Lässt du die Frist ungenutzt verstreichen, verärgert das ${tender.clientName} (−${TENDER_IGNORE_REP_LOSS} Kundenansehen). Eine rechtzeitige Absage bleibt folgenlos.</p>
        <button class="btn btn-danger btn-sm" onclick="rejectContractTender('${tender.id}')">✗ Ausschreibung ablehnen</button>
      </div>
    </div>`;
  openModal('Angebot vorbereiten', html);
}

export function rejectContractTender(tenderId) {
  if (declineContractTender(tenderId)) closeModal();
}

export function placeContractBid(tenderId, strategyId) {
  if (bidForContract(tenderId, strategyId)) {
    closeModal();
    emitProgressEvent('tutorial-action', { action: 'tender-bid' });
  }
}

export function openTourPlanner() {
  const draft = _tourPlannerDraft();
  const trainingStart = GS.orders.available.find(order => order.isTutorial && order.tutorialSeq === 0)?.origin;
  const firstVehicle = _tourVehicles().find(item => item.currentCity === trainingStart) || _tourVehicles()[0];
  const trainingVehicle = trainingStart && firstVehicle?.currentCity === trainingStart ? firstVehicle : null;
  draft.vehicleId = trainingVehicle?.id || (_tourVehicles().some(item => item.id === draft.vehicleId)
    ? draft.vehicleId
    : firstVehicle?.id || null);
  draft.orderIds = [];
  draft.returnToBase = false;
  _renderTourPlanner();
  emitProgressEvent('tutorial-action', { action: 'tour-planner-opened' });
}

export function selectTourVehicle(vehicleId) {
  const draft = _tourPlannerDraft();
  draft.vehicleId = vehicleId;
  draft.orderIds = [];
  _renderTourPlanner();
}

export function toggleTourOrder(orderId) {
  const draft = _tourPlannerDraft();
  const index = draft.orderIds.indexOf(orderId);
  if (index >= 0) draft.orderIds.splice(index, 1);
  else draft.orderIds.push(orderId);
  _renderTourPlanner();
}

export function moveTourOrder(orderId, direction) {
  const draft = _tourPlannerDraft();
  const index = draft.orderIds.indexOf(orderId);
  const target = index + Number(direction);
  if (index < 0 || target < 0 || target >= draft.orderIds.length) return;
  const [moved] = draft.orderIds.splice(index, 1);
  draft.orderIds.splice(target, 0, moved);
  _renderTourPlanner();
}

export function setTourReturn(returnToBase) {
  _tourPlannerDraft().returnToBase = !!returnToBase;
  _renderTourPlanner();
}

export function dispatchPlannedTour() {
  const draft = _tourPlannerDraft();
  const vehicle = GS.vehicles.find(item => item.id === draft.vehicleId);
  const eligibleCount = vehicle ? _tourEligibleOrders(vehicle).length : 0;
  const orderCount = draft.orderIds.length;
  const returnToBase = draft.returnToBase;
  const lastOrder = GS.orders.available.find(order => order.id === draft.orderIds[orderCount - 1]);
  const endCountry = lastOrder ? cityById[lastOrder.destination]?.country : null;
  const endsAbroad = !returnToBase && !!endCountry && endCountry !== cityById[GS.company.hqCity]?.country;
  if (dispatchTour(draft.vehicleId, draft.orderIds, draft.returnToBase)) {
    closeModal();
    emitProgressEvent('tutorial-action', {
      action: 'tour-dispatched', orderCount, eligibleCount, returnToBase, endsAbroad,
    });
  }
}

const _route = order => `${getCityName(order.origin)} → ${getCityName(order.destination)}`;

function _guideHtml(steps, current, text) {
  return `
    <div class="tour-tutorial-hint">
      <div class="tour-tutorial-head">
        <span class="tour-tutorial-badge">🎓 Tutorial</span>
        <ol class="tour-tutorial-progress">
          ${steps.map((label, index) => `
            <li class="${index < current ? 'done' : index === current ? 'current' : ''}">
              <span>${index < current ? '✓' : index + 1}</span>${label}
            </li>`).join('')}
        </ol>
      </div>
      <p>${text}</p>
    </div>`;
}

/** Builds the step-by-step guidance shown inside the tour planner during tutorial chapters. */
function _tourTutorialGuide(vehicle, selected, unselected, eligibleCount, projection) {
  const none = { html: '', targetOrderId: null, highlightStart: false };
  const info = ensureTutorialState().status === 'active' ? getActiveTutorialStep() : null;
  if (!info || !vehicle) return none;

  if (info.chapter.id === 'europe-network' && info.index === 0) {
    return {
      ...none,
      html: _guideHtml(['Ladung ins Ausland wählen', 'Ohne Rückkehr starten'], selected.length ? 1 : 0,
        'Wähle Ladungen, deren letzter Stopp im Ausland liegt, und lass den Haken bei „Danach zur Zentrale zurückkehren“ weg. Dein LKW bleibt dort und übernimmt Anschlussfracht.'),
      highlightStart: selected.length > 0,
    };
  }
  if (info.chapter.id !== 'tour-planning') return none;

  const steps = ['Erste Ladung', 'Rückladung', 'Prüfen & starten'];
  const training = unselected.filter(order => order.isTutorial);

  if (selected.length === 0) {
    const first = training[0];
    return {
      ...none,
      targetOrderId: first?.id || null,
      html: _guideHtml(steps, 0, first
        ? `Klicke links auf den hervorgehobenen Auftrag <strong>🎓 ${_route(first)}</strong>. Dein LKW steht bereits in ${getCityName(first.origin)} – die Tour beginnt ohne Leerfahrt.`
        : 'Klicke links auf einen Auftrag. Am besten einen, der dort beginnt, wo dein LKW gerade steht („direkt erreichbar“).'),
    };
  }

  const last = selected[selected.length - 1];
  const emptyWithout = _pathDistance(last.destination, vehicle.homeCity);
  if (selected.length === 1) {
    const next = training.find(order => order.origin === last.destination)
      || unselected.find(order => _pathDistance(last.destination, order.origin) <= 200);
    if (!next) {
      return {
        ...none,
        highlightStart: true,
        html: _guideHtml(steps, 2, `Gerade passt keine Rückladung zu ${getCityName(last.destination)}. Für den Einstieg reicht diese Tour – klicke auf <strong>„🚚 Tour starten“</strong>.`),
      };
    }
    return {
      ...none,
      targetOrderId: next.id,
      html: _guideHtml(steps, 1, `Ohne weitere Ladung würde dein LKW von ${getCityName(last.destination)} <strong>${fmt.km(emptyWithout)} leer</strong> zurückfahren. Klicke auf <strong>${next.isTutorial ? '🎓 ' : ''}${_route(next)}</strong> – diese Rückladung startet ${next.origin === last.destination ? 'genau dort' : 'ganz in der Nähe'}.`),
    };
  }

  const firstLeg = selected[0];
  return {
    ...none,
    highlightStart: true,
    html: _guideHtml(steps, 2, `Stark! Statt ${fmt.km(_pathDistance(firstLeg.destination, vehicle.homeCity))} Leerfahrt verdient dein LKW jetzt auf dem Rückweg Geld. Prüfe rechts <strong>Leerfahrt (${fmt.km(projection.emptyKm)})</strong>, <strong>Auslastung (${projection.utilization} %)</strong> und <strong>Deckungsbeitrag (${fmt.money(Math.round(projection.projectedProfit))})</strong> – dann klicke auf <strong>„🚚 Tour starten“</strong>.`),
  };
}

/** Opens a modal showing per-client reputation and order statistics. */
export function openClientModal(clientId) {
  const client = DATA.CLIENTS.find(c => c.id === clientId);
  if (!client) return;
  const rep = getClientReputation(clientId);
  const { stars, cssClass } = clientRepDisplay(rep);
  const stats = (GS.clientStats && GS.clientStats[clientId])
    || { offered: 0, accepted: 0, completed: 0, failed: 0 };
  const icon = INDUSTRY_ICONS[client.industry] || '🏢';
  const html = `
    <div class="flex flex-col gap-md">
      <div style="text-align:center;padding:0.5rem 0">
        <div style="font-size:2.5rem;line-height:1">${icon}</div>
        <div class="text-sm text-muted" style="margin-top:0.25rem">${client.industry}</div>
      </div>
      <div style="text-align:center">
        <span class="client-rep-badge ${cssClass}" style="font-size:1.4rem;letter-spacing:0.05em">${stars}</span>
        <div class="text-sm text-muted" style="margin-top:0.25rem">Kundenansehen: ${rep} / 100</div>
      </div>
      <div class="table-wrap">
        <table>
          <tr><th>Statistik</th><th>Anzahl</th></tr>
          <tr><td>Angebotene Aufträge</td><td>${stats.offered}</td></tr>
          <tr><td>Angenommene Aufträge</td><td>${stats.accepted}</td></tr>
          <tr><td>Erledigte Aufträge</td><td>${stats.completed}</td></tr>
          <tr><td>Verfehlte Aufträge</td><td>${stats.failed}</td></tr>
        </table>
      </div>
    </div>`;
  openModal(client.name, html);
}

// ── Sorting ───────────────────────────────────────────────────

const SORT_LABELS = {
  value:      'Wert',
  weight:     'Gewicht',
  km:         'Entfernung',
  valuePerKm: '€/km',
  expires:    'Ablaufzeit',
  deadline:   'Frist',
  completed:  'Abschluss',
  status:     'Status',
};

/** Returns a sorted copy of the orders array for the given tab. */
function sortOrders(orders, tab) {
  const { field, dir } = GS.ui.orderSort;
  const mul = dir === 'asc' ? 1 : -1;
  return [...orders].sort((a, b) => {
    let va = 0, vb = 0;
    switch (field) {
      case 'value':
        va = tab === 'completed' ? (a.finalValue ?? a.value) : a.value;
        vb = tab === 'completed' ? (b.finalValue ?? b.value) : b.value;
        break;
      case 'weight':
        va = a.weight; vb = b.weight;
        break;
      case 'km':
        va = getDistance(a.origin, a.destination);
        vb = getDistance(b.origin, b.destination);
        break;
      case 'valuePerKm': {
        const kmA = getDistance(a.origin, a.destination);
        const kmB = getDistance(b.origin, b.destination);
        const valA = tab === 'completed' ? (a.finalValue ?? a.value) : a.value;
        const valB = tab === 'completed' ? (b.finalValue ?? b.value) : b.value;
        va = kmA > 0 ? valA / kmA : 0;
        vb = kmB > 0 ? valB / kmB : 0;
        break;
      }
      case 'expires':
        va = a.receivedMinute + (a.expiresInDays * 1440) - GS.time.totalMinutes;
        vb = b.receivedMinute + (b.expiresInDays * 1440) - GS.time.totalMinutes;
        break;
      case 'deadline':
        va = a.receivedMinute + a.deadlineDays * 1440;
        vb = b.receivedMinute + b.deadlineDays * 1440;
        break;
      case 'completed':
        va = a.completedMinute ?? 0;
        vb = b.completedMinute ?? 0;
        break;
      case 'status':
        va = (a.finalValue !== undefined && a.finalValue < a.value) ? 1 : 0;
        vb = (b.finalValue !== undefined && b.finalValue < b.value) ? 1 : 0;
        break;
    }
    return (va - vb) * mul;
  });
}

/** Updates the sort bar button states to reflect the current sort field/direction. */
function updateSortBar(tab) {
  const bar = document.getElementById('order-sort-bar');
  if (!bar) return;
  const { field, dir } = GS.ui.orderSort;

  // Show/hide tab-specific buttons
  bar.querySelectorAll('[data-sort-tab]').forEach(b => {
    b.style.display = b.dataset.sortTab === tab ? '' : 'none';
  });

  // Update active state and direction arrows on all buttons
  bar.querySelectorAll('.sort-btn').forEach(b => {
    const sortField = b.dataset.sort;
    const isActive = sortField === field;
    b.classList.toggle('active', isActive);
    const label = SORT_LABELS[sortField] || sortField;
    b.textContent = label + (isActive ? (dir === 'asc' ? ' ↑' : ' ↓') : '');
  });
}

/** Toggles or sets the sort field; re-renders the order list. */
export function setOrderSort(field) {
  const sort = GS.ui.orderSort;
  if (sort.field === field) {
    sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    sort.field = field;
    // Ascending default for time-based fields (soonest first), descending for value-based
    sort.dir = (field === 'expires' || field === 'deadline' || field === 'completed') ? 'asc' : 'desc';
  }
  renderOrders();
}



/** Renders the vehicle assignment / reassign / add-vehicle section for an active order card. */
function renderActiveOrderActions(o) {
  const plannedVehicle = GS.vehicles.find(vehicle =>
    vehicle.plannedTour?.orderIds?.includes(o.id)
  );
  if (plannedVehicle) {
    const position = plannedVehicle.plannedTour.orderIds.indexOf(o.id) + 1;
    return `
      <div class="order-meta">
        <span>🧭 Teil einer ${plannedVehicle.plannedTour.orderIds.length}-Aufträge-Tour</span>
        <span>Station ${position}</span>
        <span>🚛 ${plannedVehicle.name}</span>
        <span>🏁 ${plannedVehicle.plannedTour.returnToBase ? `Rückkehr nach ${getCityName(plannedVehicle.homeCity)}` : `Ende in ${getCityName(plannedVehicle.plannedTour.endCity)}`}</span>
      </div>`;
  }

  const activeVehicle = o.vehicleId ? GS.vehicles.find(v => v.id === o.vehicleId) : null;
  const activeVehicleName = activeVehicle ? activeVehicle.name : 'Unbekannt';

  // Vehicles with this order in their queue (can be reassigned)
  const vehiclesWithInQueue = GS.vehicles.filter(v =>
    v.orderQueue && v.orderQueue.includes(o.id)
  );

  // Vehicles currently executing this order
  const vehiclesExecuting = GS.vehicles.filter(v =>
    getVehicleActiveOrderId(v) === o.id
  );

  // Vehicles executing this order but not yet past the pickup stop (can be redirected)
  const vehiclesPrePickup = vehiclesExecuting.filter(v => !isCargoLoaded(v, o.id));

  const isQueued = vehiclesWithInQueue.length > 0;
  // Allow reassign of active order when ALL executing vehicles are still pre-pickup
  const isReassignableActive = vehiclesPrePickup.length > 0 &&
    vehiclesExecuting.length === vehiclesPrePickup.length;

  // Vehicles eligible for reassignment or additional assignment
  const eligibleForReassign = GS.vehicles.filter(v => {
    if (!v.driverId) return false;
    if (v.status !== 'idle' && v.status !== 'driving') return false;
    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    if (!cat) return false;
    return o.requirements.every(req => cat.requirements.includes(req));
  });

  // Multi-vehicle: exclude vehicles already doing this order
  const eligibleForAdd = eligibleForReassign.filter(v =>
    getVehicleActiveOrderId(v) !== o.id &&
    !(v.orderQueue || []).includes(o.id)
  );

  const canShowReassign = isQueued || isReassignableActive;
  const reassignOpts = canShowReassign
    ? eligibleForReassign
        .filter(v =>
          !vehiclesWithInQueue.some(vq => vq.id === v.id) &&
          !vehiclesExecuting.some(ve => ve.id === v.id)
        )
        .map(v => `<option value="${v.id}">${v.name}${v.status === 'driving' ? ' [Unterwegs]' : ''}</option>`)
        .join('')
    : '';

  const addOpts = eligibleForAdd
    .map(v => `<option value="${v.id}">${v.name}${v.status === 'driving' ? ' [Unterwegs]' : ''}</option>`)
    .join('');

  const vehicleAssignees = [
    ...vehiclesExecuting.map(v => `${v.name} 🔄`),
    ...vehiclesWithInQueue.map(v => `${v.name} ⏳`),
  ].join(', ') || activeVehicleName;

  return `
    <div class="order-meta">
      <span>🚛 ${vehicleAssignees}</span>
      ${vehiclesExecuting.length > 0 ? `<span class="badge badge-info">Aktiv</span>` : ''}
      ${vehiclesWithInQueue.length > 0 ? `<span class="badge badge-warning">In Warteschlange</span>` : ''}
      ${(o.remainingWeight !== undefined && o.remainingWeight < o.weight) ? `<span>📦 Geliefert: ${fmt.weight(o.weight - o.remainingWeight)} / ${fmt.weight(o.weight)} (${o.tripsCompleted} ${o.tripsCompleted !== 1 ? 'Fahrten' : 'Fahrt'})</span>` : ''}
    </div>
    ${canShowReassign && reassignOpts ? `
    <div class="order-actions" style="margin-top:0.5rem">
      <select class="form-control" id="reassign-sel-${o.id}" style="flex:1">
        <option value="">Fahrzeug für Umleitung…</option>
        ${reassignOpts}
      </select>
      <button class="btn btn-warning btn-sm"
        title="Auftrag einem anderen Fahrzeug zuweisen"
        onclick="reassignOrder('${o.id}', document.getElementById('reassign-sel-${o.id}').value)">
        🔀 Umleiten
      </button>
    </div>` : ''}
    ${addOpts ? `
    <div class="order-actions" style="margin-top:0.25rem">
      <select class="form-control" id="add-veh-sel-${o.id}" style="flex:1">
        <option value="">Fahrzeug hinzufügen…</option>
        ${addOpts}
      </select>
      <button class="btn btn-secondary btn-sm"
        title="Weiteres Fahrzeug für Teillieferung hinzufügen"
        onclick="addVehicleToOrder('${o.id}', document.getElementById('add-veh-sel-${o.id}').value)">
        ➕ Fahrzeug
      </button>
    </div>` : ''}`;
}

export function renderOrders() {
  updateOrderBadge();
  _renderTenderStrip();
  _renderContractStrip();
  const tab = GS.ui.orderTab;
  let orders = [];
  if (tab === 'available') orders = GS.orders.available.filter(isOrderAvailable);
  if (tab === 'active')    orders = GS.orders.active;
  if (tab === 'completed') orders = GS.orders.completed.slice(0, GS.ui.completedLimit);

  updateSortBar(tab);
  orders = sortOrders(orders, tab);

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

  // Skip DOM rebuild if the user has a vehicle dropdown open – closing it mid-interaction
  // would make it nearly impossible to accept an order while the game is running.
  // The order badge has already been updated above; empty-state handling ran before this check.
  if (el.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;

  // All vehicles in an assignable state (status check only – driver check done per-vehicle below)
  const candidateVehicles = GS.vehicles.filter(v =>
    v.status === 'idle' || v.status === 'driving'
  );

  let unfulfillableCount = 0;
  const cards = orders.map(o => {
    const ct = DATA.CARGO_TYPES.find(c => c.id === o.cargoType) || { icon: '📦', label: o.cargoType };
    const ch = { phone: '📞 Telefon', fax: '📠 Fax', online: '🌐 Online', contract: '📄 Vertrag' }[o.channel] || o.channel;

    // ── Urgent badge (only animate/highlight when not in completed tab) ──
    const urgentBadge = o.isUrgent
      ? `<span class="badge badge-danger urgent-badge${tab === 'completed' ? ' urgent-badge-done' : ''}" title="Eilauftrag – kurze Frist, höhere Vergütung">⚡ Eilauftrag</span>`
      : '';
    const goldBadge = o.isGold
      ? `<span class="badge badge-gold" title="Goldauftrag – stark erhöhte Vergütung, aber nur kurz verfügbar">💎 Goldauftrag</span>`
      : '';

    // ── Distance & trip calculation ──────────────────────────────
    const km = getDistance(o.origin, o.destination);

    let trips = 1;
    if (tab === 'available') {
      const selId = GS.ui.orderVehicleSelection[o.id];
      const selV  = selId ? GS.vehicles.find(v => v.id === selId) : null;
      const selCap = selV ? getVehicleEffectiveCapacity(selV) : 0;
      if (selCap > 0 && selCap < o.weight) trips = Math.ceil(o.weight / selCap);
    } else if (tab === 'active') {
      const actV  = o.vehicleId ? GS.vehicles.find(v => v.id === o.vehicleId) : null;
      const actCap = actV ? getVehicleEffectiveCapacity(actV) : 0;
      if (actCap > 0 && actCap < o.weight) trips = Math.ceil(o.weight / actCap);
    } else if (tab === 'completed') {
      trips = o.tripsCompleted > 0 ? o.tripsCompleted : 1;
    }
    const totalKm   = km * trips;
    const kmLabel   = trips > 1
      ? `📍 ${fmt.km(totalKm)} (${trips}×${fmt.km(km)})`
      : `📍 ${fmt.km(km)}`;
    const valueForKm = (tab === 'completed' && o.finalValue != null) ? o.finalValue : o.value;
    const eurPerKm  = totalKm > 0 ? Math.round(valueForKm / totalKm) : 0;

    // ── €/km tooltip with factor breakdown ───────────────────────
    const cargoTypeName = (DATA.CARGO_TYPES.find(c => c.id === o.cargoType) || {}).label || o.cargoType;
    const fFactor  = o.freightFactor  ?? (CARGO_TYPE_KM_FACTORS[o.cargoType] ?? 1.0);
    const uFactor  = o.urgencyFactor  ?? (o.isUrgent ? 1.4 : 1.0);
    const baseRate = o.pricePerKm     ?? null;
    let kmTooltipParts = [`Basis: ${BASE_MIN_KM_PRICE}–${BASE_MAX_KM_PRICE} €/km`];
    if (baseRate !== null) kmTooltipParts.push(`Basispreis: ${baseRate.toFixed(2)} €/km`);
    kmTooltipParts.push(`${cargoTypeName}: ×${fFactor.toFixed(1)}`);
    if (o.isUrgent) kmTooltipParts.push(`Eilauftrag: ×${uFactor.toFixed(1)}`);
    const kmTooltip = kmTooltipParts.join(' · ');

    // ── Deadline display ─────────────────────────────────────────
    let deadlineHtml = '';
    let deadlineMetaHtml = '';
    if (tab === 'available') {
      const ageMin    = GS.time.totalMinutes - o.receivedMinute;
      const expiresIn = o.expiresInDays * 1440 - ageMin;
      const hoursLeft = Math.max(0, Math.floor(expiresIn / 60));
      deadlineHtml = `<span class="order-deadline ${hoursLeft < 12 ? 'badge-danger' : 'badge-warning'} badge">
        ⏱ noch ${hoursLeft}h</span>`;
      const deadlineDateTime = gameMinutesToDateTime(o.receivedMinute + o.deadlineDays * 1440);
      deadlineMetaHtml = `<span>${o.isUrgent ? '🔴' : '📅'} Frist: ${deadlineDateTime}</span>`;
    } else if (tab === 'active') {
      const deadlineDateTime = gameMinutesToDateTime(o.receivedMinute + o.deadlineDays * 1440);
      deadlineMetaHtml = `<span>${o.isUrgent ? '🔴' : '📅'} Frist: ${deadlineDateTime}</span>`;
    }

    // ── Client reputation badge ──────────────────────────────────
    const clientRep = getClientReputation(o.clientId);
    const { stars: repStars, cssClass: repClass } = clientRepDisplay(clientRep);
    const clientRepHtml = `<span class="client-rep-badge ${repClass}" title="Kundenansehen: ${clientRep}/100">${repStars}</span>`;

    // ── Feasibility for available tab ────────────────────────────
    let feasibilityIcon = '';
    let rejectionReason = '';
    if (tab === 'available') {
      const { feasible, reason } = canFulfillOrder(o);
      if (feasible) {
        feasibilityIcon = `<span class="order-feasibility-ok" title="Auftrag erfüllbar">✔</span>`;
      } else {
        feasibilityIcon = `<span class="order-feasibility-err" title="${reason}">✘</span>`;
        rejectionReason = reason;
        unfulfillableCount++;
      }
    }

    // ── Vehicle selection for available tab ──────────────────────
    const savedVehicleId = GS.ui.orderVehicleSelection[o.id] || '';
    const { eligibleVehicles, vOptsForOrder } = candidateVehicles.reduce((acc, v) => {
      const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
      if (!cat || !o.requirements.every(req => getVehicleEffectiveRequirements(v).includes(req))) return acc;
      const hasDriver = !!v.driverId;
      if (hasDriver && !driverMeetsRequirements(getDriverByVehicle(v), o.requirements)) return acc;
      if (hasDriver) acc.eligibleVehicles.push(v);
      const returningToBase = isVehicleReturningToBase(v);
      const queueInfo = v.status === 'driving' && hasDriver && !returningToBase
        ? ` [Warteschlange: Position ${(v.orderQueue || []).length + 1}]`
        : returningToBase && hasDriver ? ' [Startet direkt]' : '';
      const noDriverHint = !hasDriver ? ' – Kein Fahrer' : '';
      const minsUntilPickup = hasDriver ? _calcMinsUntilPickup(v, cat, o.origin) : null;
      const etaHint = minsUntilPickup !== null ? ` [ab ${_fmtPickupEta(minsUntilPickup)}]` : '';
      acc.vOptsForOrder += `<option value="${v.id}"${v.id === savedVehicleId ? ' selected' : ''}${!hasDriver ? ' disabled' : ''}>${v.name} (${fmt.weight(getVehicleEffectiveCapacity(v))})${queueInfo}${etaHint}${noDriverHint}</option>`;
      return acc;
    }, { eligibleVehicles: [], vOptsForOrder: '' });

    // ── Completed-tab specifics ──────────────────────────────────
    let completedHtml = '';
    if (tab === 'completed') {
      const isLate    = o.finalValue < o.value;
      const penalty   = isLate ? o.value - o.finalValue : 0;
      const paidClass = isLate ? 'badge-danger' : 'badge-success';
      const completedAt = o.completedMinute !== null
        ? gameMinutesToDateTime(o.completedMinute) : '–';
      completedHtml = `
      <div class="order-meta">
        <span class="${paidClass} badge">
          ${isLate ? '⚠️ Verspätet' : '✅ Pünktlich'} – Gezahlt: ${fmt.money(o.finalValue)}
        </span>
        ${isLate ? `<span class="badge badge-danger">Strafe: ${fmt.money(penalty)}</span>` : ''}
        ${o.streakBonus > 0 ? `<span class="badge badge-warning">🔥 Serienbonus: ${fmt.money(o.streakBonus)}</span>` : ''}
        <span>🕐 Erledigt: ${completedAt}</span>
      </div>`;
    }

    // ── Card CSS class ───────────────────────────────────────────
    let cardClass = 'order-card';
    if (tab === 'completed') {
      if (o.finalValue < o.value) cardClass += ' order-card-failed';
    } else if (o.isGold) {
      cardClass += ' order-card-gold';
    } else if (o.isUrgent) {
      cardClass += ' order-card-urgent';
    }
    if (o.isContract) cardClass += ' order-card-contract';

    return `
    <div class="${cardClass}">
      <div class="order-card-header">
        <div class="order-header-left">
          ${feasibilityIcon}
          <div>
            <div class="order-route">
              <span class="city">${getCityName(o.origin)}</span>
              <span class="arrow">→</span>
              <span class="city">${getCityName(o.destination)}</span>
            </div>
            <div class="text-sm text-muted mt-sm">
              <span class="client-link" data-client-id="${o.clientId}" title="Unternehmensübersicht öffnen">${o.clientName}</span>
              ${clientRepHtml}
            </div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="order-value">${fmt.money(o.value)}</div>
          ${o.isContract ? '<span class="badge badge-contract">📄 Vertragsladung</span>' : ''}
          ${o.isTutorial ? '<span class="badge badge-training">🎓 Übungsauftrag</span>' : ''}
          ${goldBadge}
          ${urgentBadge}
          ${deadlineHtml}
        </div>
      </div>

      <div class="order-meta">
        <span>${ct.icon} ${o.cargoDesc}</span>
        <span>⚖️ ${fmt.weight(o.weight)}</span>
        <span>${ch}</span>
        ${deadlineMetaHtml}
        ${tab !== 'completed' ? `<span>🎁 Bonus: ${fmt.money(o.bonus)}</span>` : ''}
        <span>${kmLabel}</span>
        <span title="${kmTooltip}">💰 ${fmt.money(eurPerKm)}/km</span>
        ${o.requirements.length ? `<span>⚠️ ${o.requirements.map(r => REQ_LABELS[r] || r).join(', ')}</span>` : ''}
      </div>

      ${tab === 'available' && eligibleVehicles.length > 0 ? `
      <div class="order-actions">
        <select class="form-control" id="vsel-${o.id}" style="flex:1" onchange="saveOrderVehicleSelection('${o.id}', this.value)">
          <option value="">Fahrzeug wählen…</option>
          ${vOptsForOrder}
        </select>
        <button class="btn btn-success btn-sm"
                title="Auftrag annehmen: +${TIME_COSTS.assignOrder} Min"
                onclick="acceptOrder('${o.id}', document.getElementById('vsel-${o.id}').value)">✓ Annehmen</button>
        <button class="btn btn-danger btn-sm"  onclick="declineOrder('${o.id}')">✗ Ablehnen</button>
      </div>` : ''}

      ${tab === 'available' && eligibleVehicles.length === 0 && vOptsForOrder ? `
      <div class="order-rejection-hint">⚠ ${rejectionReason}</div>
      <div class="order-actions">
        <select class="form-control" id="vsel-${o.id}" style="flex:1" disabled>
          <option value="">Fahrzeug wählen…</option>
          ${vOptsForOrder}
        </select>
        <button class="btn btn-danger btn-sm" onclick="declineOrder('${o.id}')">✗ Ablehnen</button>
      </div>` : ''}

      ${tab === 'available' && eligibleVehicles.length === 0 && !vOptsForOrder ? `
      <div class="order-rejection-hint">⚠ ${rejectionReason}</div>
      <button class="btn btn-danger btn-sm" onclick="declineOrder('${o.id}')">✗ Ablehnen</button>
      ` : ''}

      ${tab === 'active' ? renderActiveOrderActions(o) : ''}

      ${completedHtml}
    </div>`;
  }).join('');

  const rejectBtn = (tab === 'available' && unfulfillableCount > 0)
    ? `<div class="order-reject-all">
         <button class="btn btn-warning" onclick="declineUnfulfillableOrders()">
           ✗ Nicht erfüllbare Aufträge ablehnen (${unfulfillableCount})
         </button>
       </div>`
    : '';

  let showMoreBtn = '';
  if (tab === 'completed' && GS.orders.completed.length > GS.ui.completedLimit) {
    const remaining = GS.orders.completed.length - GS.ui.completedLimit;
    showMoreBtn = `<div class="order-show-more">
      <button class="btn btn-secondary" onclick="showMoreCompletedOrders()">
        ⬇ Weitere anzeigen (${remaining} verbleibend)
      </button>
    </div>`;
  }

  el.innerHTML = cards + rejectBtn + showMoreBtn;

  // Attach client-link click handlers via event delegation (avoids inline onclick interpolation)
  el.querySelectorAll('.client-link[data-client-id]').forEach(link => {
    link.addEventListener('click', () => openClientModal(link.dataset.clientId));
  });
}

export function showMoreCompletedOrders() {
  GS.ui.completedLimit += 10;
  renderOrders();
}

export function switchOrderTab(tab) {
  GS.ui.orderTab = tab;
  if (tab === 'completed') GS.ui.completedLimit = 10;
  // Reset sort field when switching to a tab where the current field doesn't apply
  const tabSpecificFields = { expires: 'available', deadline: 'active', completed: 'completed', status: 'completed' };
  const curField = GS.ui.orderSort.field;
  if (tabSpecificFields[curField] && tabSpecificFields[curField] !== tab) {
    GS.ui.orderSort.field = 'value';
    GS.ui.orderSort.dir = 'desc';
  }
  document.querySelectorAll('.order-tab').forEach(t => t.classList.remove('active'));
  $(`otab-${tab}`) && $(`otab-${tab}`).classList.add('active');
  ['available','active','completed'].forEach(t => {
    const el = $('order-list-' + t);
    if (el) el.style.display = (t === tab) ? '' : 'none';
  });
  renderOrders();
}

export function saveOrderVehicleSelection(orderId, vehicleId) {
  GS.ui.orderVehicleSelection[orderId] = vehicleId;
  renderOrders();
}
