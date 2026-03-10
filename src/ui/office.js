import { $, fmt } from '../utils.js';
import { GS } from '../state.js';
import { TIME_COSTS } from '../constants.js';
import { openEventsModal, openSettingsModal, openStatsModal } from './modal.js';
import { navigateToScreen } from './screens.js';

export function renderOffice() {
  const el = $('office-rooms');
  if (!el) return;

  const pendingOrders  = GS.orders.available.length;
  const activeVehicles = GS.vehicles.filter(v => v.status === 'driving').length;
  const brokenVehicles = GS.vehicles.filter(v => v.status === 'broken').length;
  const events         = GS.market.activeEvents.length;

  const rooms = [
    { icon: '📞', name: 'Aufträge',           desc: `${pendingOrders} neue Aufträge`,   screen: 'orders',    badge: pendingOrders || null },
    { icon: '🚛', name: 'Fuhrpark',            desc: `${GS.vehicles.length} Fahrzeuge`, screen: 'fleet',     badge: brokenVehicles || null },
    { icon: '🗺️', name: 'Routenplanung',      desc: 'Mehrpunkt-Routen',                screen: 'routes',    badge: null },
    { icon: '👥', name: 'Personal',            desc: `${GS.staff.length} Mitarbeiter`,  screen: 'personnel', badge: null },
    { icon: '💰', name: 'Buchhaltung',         desc: fmt.money(GS.finance.balance),     screen: 'finance',   badge: null },
    { icon: '🗺️', name: 'Karte',              desc: `${activeVehicles} unterwegs`,     screen: 'map',       badge: null },
    { icon: '📰', name: 'Markt & Ereignisse', desc: `${events} aktive Ereignisse`,      screen: null, action: 'events',   badge: events || null },
    { icon: '📣', name: 'Marketing',           desc: 'Werbeverträge',                   screen: 'marketing', badge: null },
    { icon: '⚙️', name: 'Einstellungen',      desc: 'Speichern & Optionen',            screen: null, action: 'settings', badge: null },
    { icon: '📊', name: 'Statistiken',         desc: `${GS.stats.ordersCompleted} Aufträge`, screen: null, action: 'stats', badge: null },
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

  const dateEl = $('office-date');
  if (dateEl) dateEl.textContent = fmt.date(GS.time.day, GS.time.month, GS.time.year);
}

export function officeAction(action) {
  if (action === 'events')   openEventsModal();
  if (action === 'settings') openSettingsModal();
  if (action === 'stats')    openStatsModal();
}
