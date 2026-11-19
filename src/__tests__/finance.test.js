import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GS } from '../state.js';
import {
  LOAN_OPTIONS,
  calculateMonthlyPayment,
  getAvailableCredit,
  getCreditLimit,
  getOutstandingDebt,
  grantLoan,
  processLoanPayments,
} from '../game/finance.js';

vi.mock('../ui/statusbar.js', () => ({ updateStatusBar: vi.fn() }));

beforeEach(() => {
  GS.finance = {
    balance: 0,
    monthRevenue: 0,
    monthExpenses: 0,
    transactions: [],
    loans: [],
  };
  GS.stats = {
    totalRevenue: 0,
    totalExpenses: 0,
  };
  GS.company = { reputation: 50 };
  GS.vehicles = [
    { catalogId: 'transit', health: 100 },
  ];
  GS.trailers = [];
  GS.time = { day: 1, month: 3, year: 1994 };
});

describe('Kredite', () => {
  it('berechnet Monatsraten als verzinste Annuität', () => {
    expect(calculateMonthlyPayment(20000, 0.06, 12)).toBe(1721);
    expect(calculateMonthlyPayment(50000, 0.05, 24)).toBe(2194);
  });

  it('zählt die Kreditauszahlung nicht als Umsatz und begrenzt die Restschuld', () => {
    const standardLoan = LOAN_OPTIONS.find(loan => loan.id === 'standard');
    expect(grantLoan(standardLoan).ok).toBe(true);
    expect(grantLoan(standardLoan).ok).toBe(false);

    expect(GS.finance.balance).toBe(50000);
    expect(GS.stats.totalRevenue).toBe(0);
    expect(getOutstandingDebt()).toBe(50000);
    expect(getAvailableCredit()).toBe(getCreditLimit() - 50000);
  });

  it('berücksichtigt angehängte Anhänger beim Kreditrahmen', () => {
    GS.vehicles[0] = { catalogId: 'semi', health: 100 };
    const limitWithoutTrailer = getCreditLimit();
    GS.vehicles[0].trailerId = 'reefer_trailer';

    expect(getCreditLimit()).toBeGreaterThan(limitWithoutTrailer);
  });

  it('trennt bei der Monatsrate Zinsen und Tilgung in der Buchführung', () => {
    const shortLoan = LOAN_OPTIONS.find(loan => loan.id === 'short');
    grantLoan(shortLoan);

    const result = processLoanPayments();

    expect(result.interestPaid).toBe(100);
    expect(result.principalPaid).toBe(1621);
    expect(result.paid).toBe(1721);
    expect(GS.finance.balance).toBe(20000 - 1721);
    expect(GS.stats.totalExpenses).toBe(100);
    expect(GS.finance.loans[0].remainingBalance).toBe(18379);
    expect(GS.finance.loans[0].remainingMonths).toBe(11);
  });

  it('tilgt einen Kredit am Ende der Laufzeit vollständig', () => {
    const shortLoan = LOAN_OPTIONS.find(loan => loan.id === 'short');
    grantLoan(shortLoan);

    for (let month = 0; month < 12; month++) processLoanPayments();

    expect(GS.finance.loans).toEqual([]);
    expect(getOutstandingDebt()).toBe(0);
  });

  it('initialisiert Kreditdaten für alte Spielstände', () => {
    delete GS.finance.loans;

    processLoanPayments();

    expect(GS.finance.loans).toEqual([]);
  });
});
