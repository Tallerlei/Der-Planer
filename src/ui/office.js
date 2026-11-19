import { $, fmt } from '../utils.js';
import { GS } from '../state.js';
import { TIME_COSTS, REP_WARNING_THRESHOLD, REP_DANGER_THRESHOLD } from '../constants.js';
import { openEventsModal, openSettingsModal, openStatsModal, openReputationDashboard } from './modal.js';
import { navigateToScreen } from './screens.js';
import { openAchievementsModal, openCampaignModal } from './dialogs.js';
import { ACHIEVEMENTS, getChapterStatus, ensureProgressState, currentStreakBonusPct, isStoryMode } from '../game/progression.js';
import { ensureDepotScene } from '../three/assets.js';

function _depotState() {
  return {
    companyName: GS.company.name,
    hour: GS.time.hour + GS.time.minute / 60,
    vehicles: GS.vehicles.map(v => ({
      id: v.id,
      catalogId: v.catalogId,
      trailerId: v.trailerId || null,
      atDepot: v.status !== 'driving' && v.status !== 'broken' && v.currentCity === v.homeCity,
    })),
  };
}

let _lastCaption = null;
let _lastGoals = null;

function _renderDepotCaption() {
  const el = $('depot-caption');
  if (!el) return;
  const parked  = GS.vehicles.filter(v => v.status !== 'driving' && v.status !== 'broken' && v.currentCity === v.homeCity).length;
  const driving = GS.vehicles.filter(v => v.status === 'driving').length;
  const broken  = GS.vehicles.filter(v => v.status === 'broken').length;
  const html = `🅿️ ${parked} auf dem Hof · 🚚 ${driving} unterwegs${broken ? ` · <span class="text-danger">🚨 ${broken} liegengeblieben</span>` : ''}`;
  if (_lastCaption !== html || !el.innerHTML) { el.innerHTML = html; _lastCaption = html; }
}

function _renderGoals() {
  const el = $('office-goals');
  if (!el) return;
  const p = ensureProgressState();
  const status = getChapterStatus();
  const unlocked = Object.keys(p.achievements).length;
  const streakPct = Math.round(currentStreakBonusPct() * 1000) / 10;

  let goalsHtml = '';
  if (status) {
    goalsHtml = `
      <div class="goals-card" onclick="openCampaignModal()" title="Kampagne öffnen">
        <div class="goals-head">
          <span class="goals-kicker">📖 Kapitel ${status.index + 1} von ${status.total}</span>
          <span class="goals-reward">🎁 ${fmt.money(status.chapter.reward)}</span>
        </div>
        <div class="goals-title">${status.chapter.title}</div>
        ${status.objectives.map(o => {
          const pct = Math.round((o.cur / o.target) * 100);
          const cur = o.money ? fmt.money(o.cur) : fmt.num(o.cur);
          const tgt = o.money ? fmt.money(o.target) : fmt.num(o.target);
          return `<div class="goal-row ${o.done ? 'goal-done' : ''}">
            <span class="goal-check">${o.done ? '✅' : '⬜'}</span>
            <span class="goal-label">${o.label}</span>
            <span class="goal-count">${cur} / ${tgt}</span>
            <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
          </div>`;
        }).join('')}
      </div>`;
  } else if (isStoryMode() && p.campaignDone) {
    goalsHtml = `<div class="goals-card goals-done" onclick="openCampaignModal()">👑 <strong>Kampagne gemeistert!</strong> Du bist eine Logistik-Legende.</div>`;
  }

  const html = `
    ${goalsHtml}
    <div class="goals-mini">
      <div class="mini-stat ${p.streak >= 3 ? 'hot' : ''}" title="Pünktlichkeits-Serie">🔥 <strong>${p.streak}</strong><span>Serie (+${streakPct} %)</span></div>
      <div class="mini-stat" onclick="openAchievementsModal()" title="Erfolge">🏅 <strong>${unlocked}/${ACHIEVEMENTS.length}</strong><span>Erfolge</span></div>
      <div class="mini-stat" title="Pünktlich gelieferte Goldaufträge">💎 <strong>${p.goldDelivered}</strong><span>Goldaufträge</span></div>
      <div class="mini-stat" title="Beste Serie">🏆 <strong>${p.bestStreak}</strong><span>Beste Serie</span></div>
    </div>`;
  if (_lastGoals !== html || !el.innerHTML) { el.innerHTML = html; _lastGoals = html; }
}

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
    { icon: '👥', name: 'Personal',            desc: `${GS.staff.length} Mitarbeiter`,        screen: 'personnel', badge: null, badgeClass: '' },
    { icon: '💰', name: 'Buchhaltung',         desc: fmt.money(GS.finance.balance),           screen: 'finance',   badge: null, badgeClass: '' },
    { icon: '🗺️', name: 'Karte',              desc: `${activeVehicles} unterwegs`,           screen: 'map',       badge: null, badgeClass: '' },
    { icon: '📰', name: 'Markt & Ereignisse', desc: `${events} aktive Ereignisse`,            screen: null, action: 'events',     badge: events || null, badgeClass: '' },
    { icon: '📣', name: 'Marketing',           desc: 'Werbeverträge',                         screen: 'marketing', badge: null, badgeClass: '' },
    { icon: '⚙️', name: 'Einstellungen',      desc: 'Speichern & Optionen',                  screen: null, action: 'settings',   badge: null, badgeClass: '' },
    { icon: '📊', name: 'Statistiken',         desc: `${GS.stats.ordersCompleted} Aufträge`, screen: null, action: 'stats',       badge: null, badgeClass: '' },
    { icon: '🏆', name: 'Ansehen',             desc: `${companyRep} / 100 Unternehmensansehen`, screen: null, action: 'reputation', badge: repBadge, badgeClass: repBadgeClass },
    { icon: '🏅', name: 'Erfolge',             desc: `${Object.keys(ensureProgressState().achievements).length} / ${ACHIEVEMENTS.length} freigeschaltet`, screen: null, action: 'achievements', badge: null, badgeClass: '' },
  ];
  if (isStoryMode()) {
    rooms.push({ icon: '📖', name: 'Kampagne', desc: 'Story & Kapitelziele', screen: null, action: 'campaign', badge: null, badgeClass: '' });
  }

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

  _renderGoals();
  _renderDepotCaption();
  ensureDepotScene($('office-depot'), _depotState);
}

export function officeAction(action) {
  if (action === 'events')     openEventsModal();
  if (action === 'settings')   openSettingsModal();
  if (action === 'stats')      openStatsModal();
  if (action === 'reputation') openReputationDashboard();
  if (action === 'achievements') openAchievementsModal();
  if (action === 'campaign')   openCampaignModal();
}
