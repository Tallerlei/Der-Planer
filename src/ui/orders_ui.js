import { $, fmt } from '../utils.js';
import { DATA } from '../data.js';
import { GS, cityById, getCityName } from '../state.js';
import { TIME_COSTS, REQ_LABELS } from '../constants.js';
import { canFulfillOrder, isOrderAvailable } from '../game/orders.js';
import {
  acceptOrder, declineOrder, declineUnfulfillableOrders, getClientReputation,
  getVehicleActiveOrderId, isCargoLoaded,
} from '../game/engine.js';
import { isVehicleReturningToBase, getVehicleEffectiveCapacity, getVehicleEffectiveRequirements } from '../game/vehicles.js';
import { updateOrderBadge } from './statusbar.js';
import { getDistance } from '../routing.js';
import { openModal } from './modal.js';

// ── Helpers ───────────────────────────────────────────────────

/** Converts a game totalMinutes value to a formatted date+time string (DD.MM.YYYY HH:MM).
 *  The game clock starts at 01.03.1994 (totalMinutes=0 → midnight of that day). */
function gameMinutesToDateTime(totalMin) {
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

const INDUSTRY_ICONS = {
  food: '🍎', building: '🏗️', hazmat: '⚠️', auto: '🚗', fuel: '⛽',
  tech: '💻', medical: '🏥', fashion: '👗', sports: '⚽',
  industrial: '🔧', paper: '📄', furniture: '🪑', general: '📦',
};

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
        va = a.acceptedMinute !== null ? a.acceptedMinute + a.deadlineDays * 1440 : a.deadlineDays * 1440;
        vb = b.acceptedMinute !== null ? b.acceptedMinute + b.deadlineDays * 1440 : b.deadlineDays * 1440;
        break;
      case 'completed':
        va = a.completedMinute ?? 0;
        vb = b.completedMinute ?? 0;
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
  const tab = GS.ui.orderTab;
  let orders = [];
  if (tab === 'available') orders = GS.orders.available.filter(isOrderAvailable);
  if (tab === 'active')    orders = GS.orders.active;
  if (tab === 'completed') orders = GS.orders.completed.slice(0, 50);

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
    const ch = { phone: '📞 Telefon', fax: '📠 Fax', online: '🌐 Online' }[o.channel] || o.channel;

    // ── Urgent badge (only animate/highlight when not in completed tab) ──
    const urgentBadge = o.isUrgent
      ? `<span class="badge badge-danger urgent-badge${tab === 'completed' ? ' urgent-badge-done' : ''}" title="Eilauftrag – kurze Frist, höhere Vergütung">⚡ Eilauftrag</span>`
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

    // ── Deadline display ─────────────────────────────────────────
    let deadlineHtml = '';
    let deadlineMetaHtml = '';
    if (tab === 'available') {
      const ageMin    = GS.time.totalMinutes - o.receivedMinute;
      const expiresIn = o.expiresInDays * 1440 - ageMin;
      const hoursLeft = Math.max(0, Math.floor(expiresIn / 60));
      deadlineHtml = `<span class="order-deadline ${hoursLeft < 12 ? 'badge-danger' : 'badge-warning'} badge">
        ⏱ noch ${hoursLeft}h</span>`;
      const deadlineDateTime = gameMinutesToDateTime(GS.time.totalMinutes + o.deadlineDays * 1440);
      deadlineMetaHtml = `<span>${o.isUrgent ? '🔴' : '📅'} Frist: ${deadlineDateTime}</span>`;
    } else if (tab === 'active') {
      const deadlineDateTime = o.acceptedMinute !== null
        ? gameMinutesToDateTime(o.acceptedMinute + o.deadlineDays * 1440)
        : `${o.deadlineDays} ${o.deadlineDays === 1 ? 'Tag' : 'Tage'}`;
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
      if (hasDriver) acc.eligibleVehicles.push(v);
      const returningToBase = isVehicleReturningToBase(v);
      const queueInfo = v.status === 'driving' && hasDriver && !returningToBase
        ? ` [Warteschlange: Position ${(v.orderQueue || []).length + 1}]`
        : returningToBase && hasDriver ? ' [Startet direkt]' : '';
      const noDriverHint = !hasDriver ? ' – Kein Fahrer' : '';
      acc.vOptsForOrder += `<option value="${v.id}"${v.id === savedVehicleId ? ' selected' : ''}${!hasDriver ? ' disabled' : ''}>${v.name} (${fmt.weight(getVehicleEffectiveCapacity(v))})${queueInfo}${noDriverHint}</option>`;
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
        <span>🕐 Erledigt: ${completedAt}</span>
      </div>`;
    }

    // ── Card CSS class ───────────────────────────────────────────
    let cardClass = 'order-card';
    if (tab === 'completed') {
      if (o.finalValue < o.value) cardClass += ' order-card-failed';
    } else if (o.isUrgent) {
      cardClass += ' order-card-urgent';
    }

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
        <span>💰 ${fmt.money(eurPerKm)}/km</span>
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

  el.innerHTML = cards + rejectBtn;

  // Attach client-link click handlers via event delegation (avoids inline onclick interpolation)
  el.querySelectorAll('.client-link[data-client-id]').forEach(link => {
    link.addEventListener('click', () => openClientModal(link.dataset.clientId));
  });
}

export function switchOrderTab(tab) {
  GS.ui.orderTab = tab;
  // Reset sort field when switching to a tab where the current field doesn't apply
  const tabSpecificFields = { expires: 'available', deadline: 'active', completed: 'completed' };
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
