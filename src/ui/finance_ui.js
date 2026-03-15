import { $, fmt } from '../utils.js';
import { GS } from '../state.js';
import { addTransaction } from '../game/finance.js';
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

/** Loan definitions are static – rendered once and cached. */
let _loansRendered = false;

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
  if (loanEl && !_loansRendered) {
    const loans = [
      { amount: 20000,  rate: 0.06,  months: 12, label: 'Kurzkredit' },
      { amount: 50000,  rate: 0.05,  months: 24, label: 'Standardkredit' },
      { amount: 150000, rate: 0.045, months: 48, label: 'Investitionskredit' },
    ];
    loanEl.innerHTML = loans.map(l => `
      <div class="loan-card">
        <h3>${l.label}</h3>
        <div class="loan-details">
          Betrag: ${fmt.money(l.amount)}<br>
          Zinssatz: ${(l.rate * 100).toFixed(1)} %/Jahr<br>
          Laufzeit: ${l.months} Monate<br>
          Rate: ${fmt.money(Math.round(l.amount * (1 + l.rate) / l.months))}/Mo
        </div>
        <button class="btn btn-ghost btn-sm" onclick="takeLoan(${l.amount}, ${l.rate}, ${l.months})">
          Kredit aufnehmen
        </button>
      </div>`).join('');
    _loansRendered = true;
  }
}

export function takeLoan(amount, rate, months) {
  if (confirm(`Kredit über ${fmt.money(amount)} aufnehmen?`)) {
    addTransaction(`Kreditaufnahme (${months} Monate)`, amount);
    showToast(`Kredit über ${fmt.money(amount)} erhalten!`, 'success');
    advanceGameTime(TIME_COSTS.takeLoan, 'Kreditaufnahme');
    renderFinance();
  }
}
