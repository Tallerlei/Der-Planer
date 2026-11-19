import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../ui/notifications.js', () => ({ showToast: vi.fn(), showTimeAdvance: vi.fn(), addLogEntry: vi.fn() }));
vi.mock('../ui/statusbar.js',     () => ({ updateStatusBar: vi.fn() }));
vi.mock('../game/save.js',        () => ({ autoSave: vi.fn(), loadGame: vi.fn() }));
vi.mock('../routing.js', () => ({
  getDistance:     vi.fn((a, b) => (a === b ? 0 : 100)),
  buildRouteStops: vi.fn(stops => stops),
  routeDistance:   vi.fn(() => 0),
}));

import { GS } from '../state.js';
import { createProgressState, registerProgressHook } from '../game/progression.js';
import {
  startRoadEvent, resolveRoadEvent, maybeTriggerRoadEvent, _resetRoadEvents,
} from '../game/road_events.js';
import { triggerPressConference, answerPressConference, _resetPress } from '../game/press.js';
import { tickVehicles } from '../game/engine.js';

function makeVehicle(overrides = {}) {
  return {
    id: 'v1', name: 'Test LKW', catalogId: 'truck_small', status: 'driving',
    fuel: 150, odometer: 0, health: 100, driverId: 'd1',
    refuelPauseMinutes: 0, stopMinutes: 0, orderQueue: [],
    homeCity: 'frankfurt', currentCity: 'frankfurt', position: { x: 0, y: 0 },
    route: {
      currentStopIndex: 0, progressPct: 10, coveredDistance: 0, totalDistance: 100,
      stops: [{ cityId: 'frankfurt', action: 'depart' }, { cityId: 'koeln', action: 'return' }],
    },
    ...overrides,
  };
}

// Simulate the UI presenters (events only fire when a presenter is registered)
const presented = [];
const pressShown = [];
registerProgressHook('road-event', ev => presented.push(ev));
registerProgressHook('press', pc => pressShown.push(pc));

beforeEach(() => {
  _resetRoadEvents();
  _resetPress();
  presented.length = 0;
  pressShown.length = 0;
  GS.started = true;
  GS.company = { name: 'Test', mode: 'story', difficulty: 'normal', reputation: 50, reputationTier: 3 };
  GS.time = { day: 1, month: 3, year: 1994, hour: 10, minute: 0, totalMinutes: 2000 };
  GS.finance = { balance: 50000, monthRevenue: 0, monthExpenses: 0, transactions: [] };
  GS.stats = { totalRevenue: 0, totalExpenses: 0, ordersCompleted: 0, ordersFailed: 0, kmDriven: 0 };
  GS.market = { fuelPrice: 1.65, speedMod: 1.0, orderValueMod: 1.0, orderVolumeMod: 1.0, activeEvents: [] };
  GS.orders = { available: [], active: [], completed: [], declined: [] };
  GS.staff = [{ id: 'd1', name: 'Hans Müller', role: 'driver', skill: 1, satisfaction: 70 }];
  GS.vehicles = [makeVehicle()];
  GS.progress = createProgressState();
});

describe('road events', () => {
  it('triggers for a driving vehicle and respects the cooldown', () => {
    expect(maybeTriggerRoadEvent(() => 0)).not.toBeNull();
    expect(presented).toHaveLength(1);
    resolveRoadEvent(null, () => 0.99);
    GS.time.totalMinutes += 60;
    expect(maybeTriggerRoadEvent(() => 0)).toBeNull();
  });

  it('applies a waiting delay that holds the vehicle in place', () => {
    const v = GS.vehicles[0];
    startRoadEvent('traffic_jam', v);
    const result = resolveRoadEvent(1);
    expect(result.tone).toBe('neutral');
    expect(v.stopMinutes).toBe(75);

    tickVehicles(60);
    expect(v.route.progressPct).toBe(10);
    expect(v.stopMinutes).toBe(15);
    tickVehicles(30);
    expect(v.route.progressPct).toBeGreaterThan(10);
  });

  it('can leave a vehicle broken down and starts a press conference', () => {
    const v = GS.vehicles[0];
    startRoadEvent('breakdown', v);
    resolveRoadEvent(2);
    expect(v.status).toBe('broken');
    expect(pressShown.map(p => p.situation)).toContain('breakdown');

    tickVehicles(120);
    expect(v.route.progressPct).toBe(10);
  });

  it('falls back to the default choice when the mechanic option is unavailable', () => {
    const v = GS.vehicles[0];
    startRoadEvent('breakdown', v);
    resolveRoadEvent(1);
    expect(v.status).toBe('broken');
  });

  it('pays out a successful risky choice and counts it as a win', () => {
    const v = GS.vehicles[0];
    startRoadEvent('side_cargo', v);
    resolveRoadEvent(0, () => 0.1);
    expect(GS.finance.balance).toBeGreaterThan(50000);
    expect(GS.progress.riskWins).toBe(1);
  });
});

describe('press conferences', () => {
  it('applies the chosen reputation effect and enforces the cooldown', () => {
    expect(triggerPressConference('growth', () => 0.5)).toBe(true);
    const shown = pressShown[pressShown.length - 1];
    const idx = shown.options.findIndex(o => o.text.includes('Nachhaltigkeit'));
    const r = answerPressConference(idx);
    expect(r.reputationMod).toBe(10);
    expect(GS.company.reputation).toBe(60);
    expect(GS.progress.pressPositive).toBe(1);

    GS.time.totalMinutes += 1440;
    expect(triggerPressConference('delay')).toBe(false);
  });

  it('picks the median answer when closed without answering', () => {
    triggerPressConference('accident');
    const r = answerPressConference(null);
    expect(r.reputationMod).toBe(-3);
  });
});
