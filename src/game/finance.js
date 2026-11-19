import { GS } from '../state.js';
import { fmt, uid } from '../utils.js';
import { updateStatusBar } from '../ui/statusbar.js';
import { DATA } from '../data.js';

export const LOAN_OPTIONS = Object.freeze([
  { id: 'short', amount: 20000, rate: 0.06, months: 12, label: 'Kurzkredit' },
  { id: 'standard', amount: 50000, rate: 0.05, months: 24, label: 'Standardkredit' },
  { id: 'investment', amount: 150000, rate: 0.045, months: 48, label: 'Investitionskredit' },
]);

export function addTransaction(desc, amount, { affectsMetrics = true } = {}) {
  GS.finance.balance += amount;
  if (affectsMetrics && amount > 0) {
    GS.finance.monthRevenue  += amount;
    GS.stats.totalRevenue    += amount;
  } else if (affectsMetrics && amount < 0) {
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

export function calculateMonthlyPayment(amount, annualRate, months) {
  if (amount <= 0 || months <= 0 || annualRate < 0) return 0;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return Math.round(amount / months);
  const factor = Math.pow(1 + monthlyRate, months);
  return Math.round(amount * monthlyRate * factor / (factor - 1));
}

function ensureLoans() {
  if (!Array.isArray(GS.finance.loans)) GS.finance.loans = [];
  return GS.finance.loans;
}

export function getOutstandingDebt() {
  return ensureLoans().reduce((sum, loan) => sum + loan.remainingBalance, 0);
}

export function getCreditLimit() {
  const vehicleValue = (GS.vehicles || []).reduce((sum, vehicle) => {
    const vehicleData = DATA.VEHICLES.find(item => item.id === vehicle.catalogId);
    const trailerData = DATA.TRAILERS.find(item => item.id === vehicle.trailerId);
    const condition = Math.max(0, Math.min(1, (vehicle.health ?? 100) / 100));
    return sum
      + (vehicleData?.purchasePrice || 0) * condition
      + (trailerData?.purchasePrice || 0) * 0.5;
  }, 0);
  const trailerValue = (GS.trailers || []).reduce((sum, trailer) => {
    const trailerData = DATA.TRAILERS.find(item => item.id === trailer.catalogId);
    return sum + (trailerData?.purchasePrice || 0) * 0.5;
  }, 0);
  const reputation = Math.max(0, Math.min(100, GS.company?.reputation ?? 50));
  const limit = 50000 + reputation * 500 + (vehicleValue + trailerValue) * 0.35;
  return Math.max(25000, Math.round(limit / 5000) * 5000);
}

export function getAvailableCredit() {
  return Math.max(0, getCreditLimit() - getOutstandingDebt());
}

export function grantLoan(option) {
  if (getAvailableCredit() < option.amount) {
    return { ok: false, reason: 'credit-limit' };
  }

  const monthlyPayment = calculateMonthlyPayment(option.amount, option.rate, option.months);
  const loan = {
    id: uid(),
    label: option.label,
    originalAmount: option.amount,
    remainingBalance: option.amount,
    annualRate: option.rate,
    termMonths: option.months,
    remainingMonths: option.months,
    monthlyPayment,
  };
  ensureLoans().push(loan);
  addTransaction(`Kreditaufnahme: ${option.label} (${option.months} Monate)`, option.amount, {
    affectsMetrics: false,
  });
  return { ok: true, loan };
}

export function processLoanPayments() {
  const loans = ensureLoans();
  let paid = 0;
  let interestPaid = 0;
  let principalPaid = 0;

  for (const loan of loans) {
    if (loan.remainingBalance <= 0 || loan.remainingMonths <= 0) continue;

    const interest = Math.round(loan.remainingBalance * loan.annualRate / 12);
    const principal = loan.remainingMonths === 1
      ? loan.remainingBalance
      : Math.min(loan.remainingBalance, Math.max(0, loan.monthlyPayment - interest));

    if (interest > 0) {
      addTransaction(`Kreditzinsen: ${loan.label}`, -interest);
    }
    if (principal > 0) {
      addTransaction(`Kredittilgung: ${loan.label}`, -principal, { affectsMetrics: false });
    }

    loan.remainingBalance = Math.max(0, loan.remainingBalance - principal);
    loan.remainingMonths = Math.max(0, loan.remainingMonths - 1);
    paid += interest + principal;
    interestPaid += interest;
    principalPaid += principal;
  }

  GS.finance.loans = loans.filter(loan => loan.remainingBalance > 0 && loan.remainingMonths > 0);
  return { paid, interestPaid, principalPaid };
}
