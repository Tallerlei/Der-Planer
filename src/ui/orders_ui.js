import { $, fmt } from '../utils.js';
import { DATA } from '../data.js';
import { GS, cityById, getCityName } from '../state.js';
import { TIME_COSTS, REQ_LABELS } from '../constants.js';
import { canFulfillOrder } from '../game/orders.js';
import { acceptOrder, declineOrder, declineUnfulfillableOrders } from '../game/engine.js';
import { updateOrderBadge } from './statusbar.js';

export function renderOrders() {
  updateOrderBadge();
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
    const urgentBadge = o.isUrgent ? `<span class="badge badge-danger urgent-badge" title="Eilauftrag – kurze Frist, höhere Vergütung">⚡ Eilauftrag</span>` : '';

    let deadlineHtml = '';
    if (tab === 'available') {
      const ageMin   = GS.time.totalMinutes - o.receivedMinute;
      const expiresIn = o.expiresInDays * 1440 - ageMin;
      const hoursLeft = Math.max(0, Math.floor(expiresIn / 60));
      deadlineHtml = `<span class="order-deadline ${hoursLeft < 12 ? 'badge-danger' : 'badge-warning'} badge">
        ⏱ noch ${hoursLeft}h</span>`;
    }

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

    const savedVehicleId = GS.ui.orderVehicleSelection[o.id] || '';
    const { eligibleVehicles, vOptsForOrder } = candidateVehicles.reduce((acc, v) => {
      const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
      if (!cat || !o.requirements.every(req => cat.requirements.includes(req))) return acc;
      const hasDriver = !!v.driverId;
      if (hasDriver) acc.eligibleVehicles.push(v);
      const queueInfo = v.status === 'driving' && hasDriver
        ? ` [Warteschlange: Position ${(v.orderQueue || []).length + 1}]`
        : '';
      const noDriverHint = !hasDriver ? ' – Kein Fahrer' : '';
      acc.vOptsForOrder += `<option value="${v.id}"${v.id === savedVehicleId ? ' selected' : ''}${!hasDriver ? ' disabled' : ''}>${v.name} (${fmt.weight(cat.capacity)})${queueInfo}${noDriverHint}</option>`;
      return acc;
    }, { eligibleVehicles: [], vOptsForOrder: '' });

    return `
    <div class="order-card${o.isUrgent ? ' order-card-urgent' : ''}">
      <div class="order-card-header">
        <div class="order-header-left">
          ${feasibilityIcon}
          <div>
            <div class="order-route">
              <span class="city">${getCityName(o.origin)}</span>
              <span class="arrow">→</span>
              <span class="city">${getCityName(o.destination)}</span>
            </div>
            <div class="text-sm text-muted mt-sm">${o.clientName}</div>
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
        <span>${o.isUrgent ? '🔴' : '📅'} Frist: ${o.deadlineDays} ${o.deadlineDays === 1 ? 'Tag' : 'Tage'}</span>
        <span>🎁 Bonus: ${fmt.money(o.bonus)}</span>
        ${o.requirements.length ? `<span>⚠️ ${o.requirements.join(', ')}</span>` : ''}
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

      ${tab === 'active' ? `
      <div class="order-meta">
        <span>🚛 ${o.vehicleId ? (GS.vehicles.find(v=>v.id===o.vehicleId)||{}).name || 'Unbekannt' : '-'}</span>
        <span>Status: Unterwegs</span>
        ${(o.remainingWeight !== undefined && o.remainingWeight < o.weight) ? `<span>📦 Geliefert: ${fmt.weight(o.weight - o.remainingWeight)} / ${fmt.weight(o.weight)} (${o.tripsCompleted} ${o.tripsCompleted !== 1 ? 'Fahrten' : 'Fahrt'})</span>` : ''}
      </div>` : ''}

      ${tab === 'completed' ? `
      <div class="order-meta">
        <span class="${o.finalValue >= o.value ? 'badge-success' : 'badge-warning'} badge">
          Gezahlt: ${fmt.money(o.finalValue)}
        </span>
      </div>` : ''}
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
}

export function switchOrderTab(tab) {
  GS.ui.orderTab = tab;
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
}
