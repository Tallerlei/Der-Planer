import { $, fmt } from '../utils.js';
import { GS } from '../state.js';
import {
  LOAN_OPTIONS,
  calculateMonthlyPayment,
  getAvailableCredit,
  getCreditLimit,
  getOutstandingDebt,
  grantLoan,
} from '../game/finance.js';
import { advanceGameTime } from '../game/engine.js';
import { showToast } from './notifications.js';
import { TIME_COSTS } from '../constants.js';

/**
 * Updates an element's innerHTML only when the new content differs from
 * the current content, avoiding unnecessary DOM rewrites.
 */
function _setIfChanged(el, html) {
  if (el.innerHTML !== html) el.innerHTML = html;
}

export function renderFinance() {
  const el = $('finance-kpis');
  if (!el) return;

  const monthProfit = GS.finance.monthRevenue - GS.finance.monthExpenses;
  const kpis = [
    { label: 'Kontostand',      value: fmt.money(GS.finance.balance),       css: GS.finance.balance >= 0 ? 'pos' : 'neg' },
    { label: 'Monatseinnahmen', value: fmt.money(GS.finance.monthRevenue),   css: 'pos' },
    { label: 'Monatskosten',    value: fmt.money(GS.finance.monthExpenses),  css: 'neg' },
    { label: 'Monatsergebnis',  value: fmt.money(monthProfit),               css: monthProfit >= 0 ? 'pos' : 'neg' },
    { label: 'Gesamtumsatz',    value: fmt.money(GS.stats.totalRevenue),     css: 'pos' },
    { label: 'Aufträge gesamt', value: GS.stats.ordersCompleted,             css: '' },
    { label: 'km gefahren',     value: fmt.km(Math.round(GS.stats.kmDriven)), css: '' },
    { label: 'Kraftstoffpreis', value: fmt.moneyDec(GS.market.fuelPrice) + '/L', css: '' },
    { label: 'Kreditschuld',    value: fmt.money(getOutstandingDebt()),       css: 'neg' },
  ];

  _setIfChanged(el, kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value ${k.css}">${k.value}</div>
    </div>`).join(''));

  const txEl = $('transaction-list');
  if (!txEl) return;
  const txs = GS.finance.transactions.slice(0, 40);
  const txHtml = txs.length === 0
    ? '<div class="text-muted text-sm">Noch keine Transaktionen.</div>'
    : txs.map(t => `
    <div class="transaction-row">
      <span class="tr-date">${t.date}</span>
      <span class="tr-desc">${t.desc}</span>
      <span class="tr-amount ${t.amount >= 0 ? 'inc' : 'exp'}">${fmt.money(t.amount)}</span>
    </div>`).join('');
  _setIfChanged(txEl, txHtml);

  const loanEl = $('loan-list');
  if (loanEl) {
    const availableCredit = getAvailableCredit();
    const creditInfo = `
      <div class="credit-overview">
        <span>Verfügbarer Kreditrahmen</span>
        <strong>${fmt.money(availableCredit)} von ${fmt.money(getCreditLimit())}</strong>
      </div>`;
    const loanHtml = creditInfo + LOAN_OPTIONS.map(l => {
      const monthlyPayment = calculateMonthlyPayment(l.amount, l.rate, l.months);
      const allowed = availableCredit >= l.amount;
      return `
      <div class="loan-card">
        <h3>${l.label}</h3>
        <div class="loan-details">
          Betrag: ${fmt.money(l.amount)}<br>
          Zinssatz: ${(l.rate * 100).toFixed(1)} %/Jahr<br>
          Laufzeit: ${l.months} Monate<br>
          Rate: ${fmt.money(monthlyPayment)}/Monat
        </div>
        <button class="btn btn-ghost btn-sm" onclick="takeLoan('${l.id}')" ${allowed ? '' : 'disabled'}>
          ${allowed ? 'Kredit aufnehmen' : 'Kreditrahmen reicht nicht'}
        </button>
      </div>`;
    }).join('');
    _setIfChanged(loanEl, loanHtml);
  }

  const activeLoansEl = $('active-loan-list');
  if (activeLoansEl) {
    const activeLoanHtml = GS.finance.loans.length === 0
      ? '<div class="text-muted text-sm">Keine aktiven Kredite.</div>'
      : GS.finance.loans.map(loan => `
        <div class="active-loan-row">
          <div>
            <strong>${loan.label}</strong>
            <div class="text-muted text-sm">Noch ${loan.remainingMonths} Monate · ${(loan.annualRate * 100).toFixed(1)} %/Jahr</div>
          </div>
          <div class="active-loan-values">
            <span>${fmt.money(loan.monthlyPayment)}/Monat</span>
            <strong>${fmt.money(loan.remainingBalance)} Restschuld</strong>
          </div>
        </div>`).join('');
    _setIfChanged(activeLoansEl, activeLoanHtml);
  }
}

export function takeLoan(optionId, rate, months) {
  const option = typeof optionId === 'string'
    ? LOAN_OPTIONS.find(loan => loan.id === optionId)
    : LOAN_OPTIONS.find(loan => (
        loan.amount === optionId && loan.rate === rate && loan.months === months
      ));
  if (!option) {
    showToast('Dieses Kreditangebot ist nicht verfügbar.', 'danger');
    return;
  }
  if (getAvailableCredit() < option.amount) {
    showToast(`Der Kreditrahmen von ${fmt.money(getCreditLimit())} reicht dafür nicht aus.`, 'danger');
    return;
  }
  const monthlyPayment = calculateMonthlyPayment(option.amount, option.rate, option.months);
  if (!confirm(`Kredit über ${fmt.money(option.amount)} zu ${fmt.money(monthlyPayment)}/Monat aufnehmen?`)) {
    return;
  }

  const result = grantLoan(option);
  if (!result.ok) {
    showToast('Der Kredit konnte nicht aufgenommen werden.', 'danger');
    return;
  }
  showToast(`Kredit über ${fmt.money(option.amount)} erhalten!`, 'success');
  advanceGameTime(TIME_COSTS.takeLoan, 'Kreditaufnahme');
  renderFinance();
}
