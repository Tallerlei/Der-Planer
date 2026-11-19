import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../ui/notifications.js', () => ({ showToast: vi.fn(), showTimeAdvance: vi.fn(), addLogEntry: vi.fn() }));
vi.mock('../ui/statusbar.js',     () => ({ updateStatusBar: vi.fn() }));
vi.mock('../game/save.js',        () => ({ autoSave: vi.fn(), loadGame: vi.fn() }));
vi.mock('../ui/modal.js',         () => ({ openModal: vi.fn(), closeModal: vi.fn(), queueModal: vi.fn() }));
vi.mock('../routing.js', () => ({
  getDistance:     vi.fn((a, b) => (a === b ? 0 : 400)),
  buildRouteStops: vi.fn(stops => stops),
  routeDistance:   vi.fn(() => 0),
}));

import { GS } from '../state.js';
import {
  createProgressState, getStreakBonusPct, recordDelivery, grantDriverXp, xpForNextLevel,
  makeGoldOrder, checkCampaign, checkAchievements, CHAPTERS, driverFuelFactor,
} from '../game/progression.js';
import { completeOrder, expireOrders, declineOrder } from '../game/engine.js';
import { maybeTriggerRoadEvent, hasPendingRoadEvent } from '../game/road_events.js';

function makeOrder(overrides = {}) {
  return {
    id: 'o1', clientId: 'c1', clientName: 'Testkunde', origin: 'frankfurt', destination: 'wien',
    weight: 2000, requirements: [], value: 1000, bonus: 100, penalty: 50,
    receivedMinute: 0, deadlineDays: 3, ...overrides,
  };
}

beforeEach(() => {
  GS.started = true;
  GS.company = { name: 'Test', mode: 'story', difficulty: 'normal', reputation: 50, reputationTier: 3, hqCity: 'frankfurt' };
  GS.time = { day: 1, month: 3, year: 1994, hour: 10, minute: 0, totalMinutes: 600 };
  GS.finance = { balance: 50000, monthRevenue: 0, monthExpenses: 0, transactions: [] };
  GS.stats = { totalRevenue: 0, totalExpenses: 0, ordersCompleted: 0, ordersFailed: 0, kmDriven: 0 };
  GS.orders = { available: [], active: [], completed: [], declined: [] };
  GS.vehicles = [];
  GS.staff = [];
  GS.clientReputation = {};
  GS.clientStats = {};
  GS.progress = createProgressState();
});

describe('punctuality streak', () => {
  it('grows the bonus by 2.5 % per step and caps it at 25 %', () => {
    expect(getStreakBonusPct(0)).toBe(0);
    expect(getStreakBonusPct(4)).toBeCloseTo(0.1);
    expect(getStreakBonusPct(10)).toBeCloseTo(0.25);
    expect(getStreakBonusPct(40)).toBeCloseTo(0.25);
  });

  it('pays the bonus of the previous streak and resets on a late delivery', () => {
    GS.progress.streak = 4;
    expect(recordDelivery(makeOrder(), true, 1000)).toBe(100);
    expect(GS.progress.streak).toBe(5);
    expect(GS.progress.bestStreak).toBe(5);

    expect(recordDelivery(makeOrder(), false, 1000)).toBe(0);
    expect(GS.progress.streak).toBe(0);
    expect(GS.progress.bestStreak).toBe(5);
    expect(GS.progress.recentLate).toHaveLength(1);
  });

  it('records delivery countries only once', () => {
    recordDelivery(makeOrder({ destination: 'wien' }), true, 1000);
    recordDelivery(makeOrder({ destination: 'wien' }), true, 1000);
    expect(GS.progress.countries).toEqual(['AT']);
  });

  it('adds the streak bonus to the payout in completeOrder', () => {
    GS.progress.streak = 2;
    const order = makeOrder();
    GS.orders.active.push(order);
    completeOrder(order, null);
    // (value 1000 + bonus 100) × 5 % streak bonus
    expect(order.streakBonus).toBe(55);
    expect(order.finalValue).toBe(1155);
    expect(GS.finance.balance).toBe(50000 + 1155);
    expect(GS.progress.streak).toBe(3);
  });
});

describe('driver experience', () => {
  it('levels up multiple times and stops at the maximum skill', () => {
    const driver = { skill: 1, xp: 0, satisfaction: 70 };
    const { levelsGained } = grantDriverXp(driver, xpForNextLevel(1) + xpForNextLevel(2) + 5);
    expect(levelsGained).toBe(2);
    expect(driver.skill).toBe(3);
    expect(driver.xp).toBe(5);
    expect(driver.satisfaction).toBe(90);

    grantDriverXp(driver, 100000);
    expect(driver.skill).toBe(5);
    expect(driver.xp).toBeLessThanOrEqual(xpForNextLevel(5));
  });

  it('lets experienced drivers save fuel', () => {
    expect(driverFuelFactor(1)).toBe(1);
    expect(driverFuelFactor(5)).toBeCloseTo(0.88);
  });
});

describe('gold orders', () => {
  it('multiplies the value and shortens the acceptance window', () => {
    const o = makeGoldOrder(makeOrder({ isUrgent: true, expiresInDays: 2 }));
    expect(o.isGold).toBe(true);
    expect(o.isUrgent).toBe(false);
    expect(o.value).toBe(2500);
    expect(o.bonus).toBe(200);
    expect(o.expiresInDays).toBe(0.5);
  });
});

describe('story campaign', () => {
  it('pays the reward and advances when all chapter objectives are met', () => {
    GS.progress.onTimeDeliveries = 3;
    GS.stats.totalRevenue = 10000;
    expect(checkCampaign()).toBe(true);
    expect(GS.progress.chapter).toBe(1);
    expect(GS.finance.balance).toBe(50000 + CHAPTERS[0].reward);
    // Chapter 2 objectives are not met yet
    expect(checkCampaign()).toBe(false);
  });

  it('does nothing in sandbox mode', () => {
    GS.company.mode = 'sandbox';
    GS.progress.onTimeDeliveries = 3;
    GS.stats.totalRevenue = 10000;
    expect(checkCampaign()).toBe(false);
    expect(GS.progress.chapter).toBe(0);
  });

  it('marks the campaign as done after the last chapter', () => {
    GS.progress.chapter = CHAPTERS.length - 1;
    GS.vehicles = Array.from({ length: 10 }, (_, i) => ({ id: `v${i}`, catalogId: 'transit' }));
    GS.stats.ordersCompleted = 100;
    GS.stats.totalRevenue = 1000000;
    GS.company.reputation = 85;
    expect(checkCampaign()).toBe(true);
    expect(GS.progress.campaignDone).toBe(true);
  });
});

describe('achievements', () => {
  it('unlocks an achievement exactly once', () => {
    GS.stats.ordersCompleted = 1;
    expect(checkAchievements().map(a => a.id)).toContain('first_delivery');
    expect(checkAchievements().map(a => a.id)).not.toContain('first_delivery');
    expect(GS.progress.achievements.first_delivery).toEqual({ day: 1, month: 3, year: 1994 });
  });

  it('remembers a negative balance for the secret achievement', () => {
    GS.finance.balance = -1;
    expect(checkAchievements().map(a => a.id)).toContain('red_numbers');
  });
});

describe('road events without a UI presenter', () => {
  it('never trigger, so headless simulations stay deterministic', () => {
    GS.staff = [{ id: 'd1', role: 'driver', skill: 1 }];
    GS.vehicles = [{
      id: 'v1', catalogId: 'transit', status: 'driving', driverId: 'd1', health: 100,
      route: { stops: [{ cityId: 'frankfurt' }, { cityId: 'wien' }], currentStopIndex: 0, progressPct: 0 },
    }];
    expect(maybeTriggerRoadEvent(() => 0)).toBeNull();
    expect(hasPendingRoadEvent()).toBe(false);
  });
});

describe('expired vs. declined offers', () => {
  beforeEach(() => { vi.stubGlobal('document', { getElementById: () => null }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('records the actual client reputation loss on the expired order', () => {
    GS.clientReputation = { c1: 50 };
    const order = makeOrder({ expiresInDays: 2, receivedMinute: 0 });
    GS.orders.available.push(order);
    GS.time.totalMinutes = 2 * 1440 + 1;
    expireOrders();
    expect(order.status).toBe('expired');
    expect(order.expiryRepBefore).toBe(50);
    expect(order.expiryRepLoss).toBe(8);
    expect(GS.clientReputation.c1).toBe(42);
  });

  it('costs no reputation when the offer is declined', () => {
    GS.clientReputation = { c1: 50 };
    GS.ui = { orderVehicleSelection: {} };
    GS.orders.available.push(makeOrder());
    declineOrder('o1');
    expect(GS.clientReputation.c1).toBe(50);
    expect(GS.orders.declined).toHaveLength(1);
  });
});
