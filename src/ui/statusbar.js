import { $, fmt } from '../utils.js';
import { GS } from '../state.js';

export function updateStatusBar() {
  if (!GS.started) return;
  const bar = $('status-bar');
  if (!bar) return;

  const badMoney = GS.finance.balance < 0;
  $('sb-money').textContent = fmt.money(GS.finance.balance);
  $('sb-money').className = 'value money' + (badMoney ? ' danger' : '');
  $('sb-reputation').textContent = (GS.company.reputation || 50) + ' / 100';
  $('sb-date').textContent = fmt.date(GS.time.day, GS.time.month, GS.time.year)
    + ` ${String(GS.time.hour).padStart(2,'0')}:${String(GS.time.minute).padStart(2,'0')}`;
  $('sb-company').textContent = GS.company.name;
  $('sb-vehicles').textContent = `${GS.vehicles.filter(v => v.status === 'driving').length}/${GS.vehicles.length}`;
  $('sb-fuel').textContent = fmt.moneyDec(GS.market.fuelPrice) + '/L';
}

export function updateOrderBadge() {
  const badge = $('badge-orders');
  if (badge) {
    const n = GS.orders.available.length;
    badge.textContent = n;
    badge.classList.toggle('visible', n > 0);
  }
  const ba = $('badge-avail');
  if (ba) ba.textContent = GS.orders.available.length;
  const bact = $('badge-active');
  if (bact) bact.textContent = GS.orders.active.length;
  const bcomp = $('badge-completed');
  if (bcomp) bcomp.textContent = GS.orders.completed.length;
}
