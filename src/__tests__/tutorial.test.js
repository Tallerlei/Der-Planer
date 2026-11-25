import { beforeEach, describe, expect, it } from 'vitest';
import { GS } from '../state.js';
import { createProgressState } from '../game/progression.js';
import {
  advanceTutorial, ensureTrainingOrders, ensureTutorialState, getActiveTutorialStep,
  getNextTutorialChapter, planTrainingChain, skipTutorialStep, startTutorialChapter,
  unlockTutorialChapters,
} from '../game/tutorial.js';
import { findShortestPath, routeDistance } from '../routing.js';

const roadKm = (from, to) => routeDistance(findShortestPath(from, to).map(cityId => ({ cityId })));

function order(id, overrides = {}) {
  return {
    id, clientId: 'c01', clientName: 'Müller', origin: 'frankfurt', destination: 'hamburg',
    weight: 2000, requirements: [], value: 1000, bonus: 0, penalty: 100,
    deadlineDays: 4, receivedMinute: 480, expiresInDays: 2, ...overrides,
  };
}

function vehicle(overrides = {}) {
  return { id: 'v1', catalogId: 'transit', status: 'idle', driverId: 'd1', health: 100, ...overrides };
}

beforeEach(() => {
  GS.started = true;
  GS.speed = 1;
  GS.company = { ...GS.company, reputation: 50, hqCity: 'frankfurt' };
  GS.time = { day: 1, month: 3, year: 1994, hour: 8, minute: 0, totalMinutes: 480 };
  GS.finance = { balance: 50000, monthRevenue: 0, monthExpenses: 0, transactions: [], loans: [] };
  GS.stats = { totalRevenue: 0, totalExpenses: 0, ordersCompleted: 0, ordersFailed: 0, kmDriven: 0 };
  GS.orders = { available: [], active: [], completed: [], declined: [] };
  GS.staff = [{ id: 'd1', role: 'driver' }];
  GS.vehicles = [vehicle({ currentCity: 'frankfurt', homeCity: 'frankfurt' })];
  GS.tenders = [];
  GS.ui = { ...GS.ui, currentScreen: 'office' };
  GS.progress = createProgressState();
});

describe('tutorial state', () => {
  it('migrates older tutorial saves and pauses skipped ones', () => {
    GS.progress.tutorial = { version: 2, status: 'skipped', unlocked: ['first-order', 'tour-planning'], completed: ['first-order'], opened: [] };
    expect(ensureTutorialState()).toMatchObject({
      version: 3, status: 'paused', stepIndex: 0, completed: ['first-order'],
    });
  });
});

describe('tutorial chapter flow', () => {
  it('teaches waiting instead of tour planning right after the first order is accepted', () => {
    GS.orders.active.push(order('o1'));
    GS.vehicles[0].status = 'driving';
    unlockTutorialChapters();
    ensureTutorialState().completed.push('first-order');
    expect(getNextTutorialChapter().id).toBe('on-the-road');
  });

  it('completes steps in order and lets one event finish only one step', () => {
    startTutorialChapter('on-the-road');
    GS.speed = 1;
    expect(advanceTutorial({ action: 'time-skip' }).advanced).toBe(0);
    expect(advanceTutorial({ action: 'screen:map' }).advanced).toBe(1);
    expect(advanceTutorial({ action: 'time-skip' })).toMatchObject({ advanced: 1, completed: null });
    GS.stats.ordersCompleted = 1;
    expect(advanceTutorial().completed?.id).toBe('on-the-road');
  });

  it('blocks the tour chapter while the only vehicle is still on the road', () => {
    GS.stats.ordersCompleted = 1;
    GS.orders.available.push(order('o2'), order('o3', { origin: 'hamburg', destination: 'bremen' }));
    GS.vehicles[0].status = 'driving';
    startTutorialChapter('tour-planning');

    expect(getActiveTutorialStep().waitReason).toMatch(/unterwegs/);
    expect(advanceTutorial({ action: 'tour-planner-opened' }).advanced).toBe(0);

    GS.vehicles[0].status = 'idle';
    expect(getActiveTutorialStep().waitReason).toBeNull();
    expect(advanceTutorial({ action: 'tour-planner-opened' }).advanced).toBe(1);
    expect(advanceTutorial({ action: 'tour-dispatched', orderCount: 1, eligibleCount: 2 }).advanced).toBe(0);
    // The event arrives after dispatch, when the vehicle is already driving again.
    GS.vehicles[0].status = 'driving';
    expect(advanceTutorial({ action: 'tour-dispatched', orderCount: 2, eligibleCount: 2 }).completed?.id)
      .toBe('tour-planning');
  });

  it('accepts a single-order tour when no second load fits', () => {
    GS.orders.available.push(order('o2'));
    startTutorialChapter('tour-planning');
    advanceTutorial({ action: 'tour-planner-opened' });
    GS.vehicles[0].status = 'driving';
    expect(advanceTutorial({ action: 'tour-dispatched', orderCount: 1, eligibleCount: 1 }).completed?.id)
      .toBe('tour-planning');
  });

  it('explains missing money before asking the player to buy a vehicle', () => {
    GS.finance.balance = 10000;
    GS.staff.push({ id: 'd2', role: 'driver' });
    startTutorialChapter('fleet-and-staff');
    advanceTutorial({ action: 'screen:finance' });
    expect(getActiveTutorialStep()).toMatchObject({ index: 2 });
    expect(getActiveTutorialStep().waitReason).toMatch(/fehlen noch 18\.000 €/);
  });

  it('unlocks the workshop chapter only once a vehicle is worn', () => {
    expect(unlockTutorialChapters().map(chapter => chapter.id)).not.toContain('workshop');
    GS.vehicles[0].health = 60;
    expect(unlockTutorialChapters().map(chapter => chapter.id)).toContain('workshop');
  });

  it('lets stuck players skip a step', () => {
    startTutorialChapter('first-order');
    skipTutorialStep();
    expect(skipTutorialStep().completed?.id).toBe('first-order');
  });
});

describe('tour tutorial training orders', () => {
  it('plans a backload chain that starts at the truck and ends closer to home', () => {
    const [first, second] = planTrainingChain('frankfurt');
    expect(first.origin).toBe('frankfurt');
    expect(second.origin).toBe(first.destination);
    expect(roadKm(second.destination, 'frankfurt')).toBeLessThan(first.km);
  });

  it('places the chain once at a ready vehicle and fits its capacity', () => {
    expect(ensureTrainingOrders()).toHaveLength(2);
    expect(GS.orders.available.every(order => order.isTutorial && order.weight <= 2000)).toBe(true);
    expect(ensureTrainingOrders()).toEqual([]);
  });

  it('waits with the training orders until a vehicle is ready', () => {
    GS.vehicles[0].status = 'driving';
    expect(ensureTrainingOrders()).toEqual([]);
  });

  it('makes the tour chapter playable even when the market has no fitting order', () => {
    GS.stats.ordersCompleted = 1;
    startTutorialChapter('tour-planning');
    expect(advanceTutorial().prepared).toHaveLength(2);
    expect(getActiveTutorialStep().waitReason).toBeNull();
  });
});

