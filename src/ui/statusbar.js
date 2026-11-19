import { $, fmt } from '../utils.js';
import { GS } from '../state.js';
import { isOrderAvailable } from '../game/orders.js';
import { ACHIEVEMENTS, CHAPTERS, ensureProgressState, currentStreakBonusPct, isStoryMode } from '../game/progression.js';

export function updateStatusBar() {
  if (!GS.started) return;
  const bar = $('status-bar');
  if (!bar) return;

  const badMoney = GS.finance.balance < 0;
  $('sb-money').textContent = fmt.money(GS.finance.balance);
  $('sb-money').className = 'value money' + (badMoney ? ' danger' : '');
  $('sb-reputation').textContent = (GS.company.reputation || 50) + ' / 100';
  $('sb-date').textContent = fmt.date(GS.time.day, GS.time.month, GS.time.year)
    + ` ${fmt.time(GS.time.hour, GS.time.minute)}`;
  $('sb-company').textContent = GS.company.name;
  $('sb-vehicles').textContent = `${GS.vehicles.filter(v => v.status === 'driving').length}/${GS.vehicles.length}`;
  $('sb-fuel').textContent = fmt.moneyDec(GS.market.fuelPrice) + '/L';

  const p = ensureProgressState();
  const streakEl = $('sb-streak');
  if (streakEl) {
    const pct = Math.round(currentStreakBonusPct() * 1000) / 10;
    $('sb-streak-value').textContent = p.streak > 0 ? `${p.streak} · +${pct} %` : '0';
    streakEl.classList.toggle('hot', p.streak >= 3);
    streakEl.classList.toggle('blazing', p.streak >= 10);
  }
  const achEl = $('sb-ach-value');
  if (achEl) achEl.textContent = `${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length}`;
  const chEl = $('sb-chapter');
  if (chEl) {
    chEl.style.display = isStoryMode() ? '' : 'none';
    $('sb-chapter-value').textContent = p.campaignDone ? '👑' : `${Math.min(p.chapter + 1, CHAPTERS.length)}/${CHAPTERS.length}`;
  }
}

export function updateOrderBadge() {
  const visibleOrders = GS.orders.available.filter(isOrderAvailable);
  const badge = $('badge-orders');
  if (badge) {
    const n = visibleOrders.length;
    badge.textContent = n;
    badge.classList.toggle('visible', n > 0);
  }
  const ba = $('badge-avail');
  if (ba) ba.textContent = visibleOrders.length;
  const bact = $('badge-active');
  if (bact) bact.textContent = GS.orders.active.length;
  const bcomp = $('badge-completed');
  if (bcomp) bcomp.textContent = GS.orders.completed.length;
}
