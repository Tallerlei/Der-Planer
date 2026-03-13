import { $, fmt } from '../utils.js';
import { GS } from '../state.js';
import { isOrderAvailable } from '../game/orders.js';

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
