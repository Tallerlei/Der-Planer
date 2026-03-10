import { GS } from '../state.js';
import { fmt, uid } from '../utils.js';
import { updateStatusBar } from '../ui/statusbar.js';

export function addTransaction(desc, amount) {
  GS.finance.balance += amount;
  if (amount > 0) {
    GS.finance.monthRevenue  += amount;
    GS.stats.totalRevenue    += amount;
  } else {
    GS.finance.monthExpenses += Math.abs(amount);
    GS.stats.totalExpenses   += Math.abs(amount);
  }
  GS.finance.transactions.unshift({
    id: uid(),
    desc,
    amount,
    date: fmt.date(GS.time.day, GS.time.month, GS.time.year),
    balance: GS.finance.balance,
  });
  if (GS.finance.transactions.length > 200) {
    GS.finance.transactions.length = 200;
  }
  updateStatusBar();
}
