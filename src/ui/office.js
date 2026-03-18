import { $, fmt } from '../utils.js';
import { GS } from '../state.js';
import { TIME_COSTS, REP_WARNING_THRESHOLD, REP_DANGER_THRESHOLD } from '../constants.js';
import { openEventsModal, openSettingsModal, openStatsModal, openReputationDashboard } from './modal.js';
import { navigateToScreen } from './screens.js';

export function renderOffice() {
  const el = $('office-rooms');
  if (!el) return;

  const pendingOrders  = GS.orders.available.length;
  const activeVehicles = GS.vehicles.filter(v => v.status === 'driving').length;
  const brokenVehicles = GS.vehicles.filter(v => v.status === 'broken').length;
  const events         = GS.market.activeEvents.length;

  // Reputation warning counts (exclusive ranges to avoid double-counting)
  const companyRep    = GS.company.reputation || 50;
  const clientReps    = Object.values(GS.clientReputation || {});
  const allReps       = [companyRep, ...clientReps];
  const dangerCount   = allReps.filter(r => r < REP_DANGER_THRESHOLD).length;
  const warningOnly   = allReps.filter(r => r >= REP_DANGER_THRESHOLD && r < REP_WARNING_THRESHOLD).length;
  const repBadge      = dangerCount > 0 ? dangerCount : (warningOnly > 0 ? warningOnly : null);
  const repBadgeClass = dangerCount > 0 ? ' room-badge-danger' : (warningOnly > 0 ? ' room-badge-warning' : '');

  const rooms = [
    { icon: '📞', name: 'Aufträge',           desc: `${pendingOrders} neue Aufträge`,        screen: 'orders',    badge: pendingOrders || null, badgeClass: '' },
    { icon: '🚛', name: 'Fuhrpark',            desc: `${GS.vehicles.length} Fahrzeuge`,      screen: 'fleet',     badge: brokenVehicles || null, badgeClass: '' },
    { icon: '🗺️', name: 'Routenplanung',      desc: 'Mehrpunkt-Routen',                      screen: 'routes',    badge: null, badgeClass: '' },
    { icon: '👥', name: 'Personal',            desc: `${GS.staff.length} Mitarbeiter`,        screen: 'personnel', badge: null, badgeClass: '' },
    { icon: '💰', name: 'Buchhaltung',         desc: fmt.money(GS.finance.balance),           screen: 'finance',   badge: null, badgeClass: '' },
    { icon: '🗺️', name: 'Karte',              desc: `${activeVehicles} unterwegs`,           screen: 'map',       badge: null, badgeClass: '' },
    { icon: '📰', name: 'Markt & Ereignisse', desc: `${events} aktive Ereignisse`,            screen: null, action: 'events',     badge: events || null, badgeClass: '' },
    { icon: '📣', name: 'Marketing',           desc: 'Werbeverträge',                         screen: 'marketing', badge: null, badgeClass: '' },
    { icon: '⚙️', name: 'Einstellungen',      desc: 'Speichern & Optionen',                  screen: null, action: 'settings',   badge: null, badgeClass: '' },
    { icon: '📊', name: 'Statistiken',         desc: `${GS.stats.ordersCompleted} Aufträge`, screen: null, action: 'stats',       badge: null, badgeClass: '' },
    { icon: '🏆', name: 'Ansehen',             desc: `${companyRep} / 100 Unternehmensansehen`, screen: null, action: 'reputation', badge: repBadge, badgeClass: repBadgeClass },
  ];

  el.innerHTML = rooms.map(r => `
    <div class="office-room"
         title="${r.screen ? `Wechsel zu: ${r.name} (+${TIME_COSTS.navigate} Min)` : r.name}"
         onclick="${r.screen ? `navigateToScreen('${r.screen}')` : `officeAction('${r.action}')`}">
      <span class="room-icon">${r.icon}</span>
      <span class="room-name">${r.name}</span>
      <span class="room-desc">${r.desc}</span>
      ${r.screen ? `<span class="room-time-cost">+${TIME_COSTS.navigate} Min</span>` : ''}
      ${r.badge ? `<span class="room-badge${r.badgeClass || ''}">${r.badge}</span>` : ''}
    </div>
  `).join('');

  const dateEl = $('office-date');
  if (dateEl) dateEl.textContent = fmt.date(GS.time.day, GS.time.month, GS.time.year);
}

export function officeAction(action) {
  if (action === 'events')     openEventsModal();
  if (action === 'settings')   openSettingsModal();
  if (action === 'stats')      openStatsModal();
  if (action === 'reputation') openReputationDashboard();
}
