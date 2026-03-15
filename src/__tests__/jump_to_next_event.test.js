import { describe, it, expect, beforeEach, vi } from 'vitest';
import { jumpToNextEvent } from '../game/engine.js';
import { GS } from '../state.js';
import { REFUEL_DURATION_MINUTES } from '../constants.js';

// Stub out DOM-dependent helpers so tests can run without a browser
vi.mock('../ui/notifications.js', () => ({ showToast: vi.fn(), showTimeAdvance: vi.fn(), addLogEntry: vi.fn() }));
vi.mock('../ui/statusbar.js',     () => ({ updateStatusBar: vi.fn() }));
vi.mock('../game/save.js',        () => ({ autoSave: vi.fn(), loadGame: vi.fn() }));

// Mock routing with a fixed known distance (100 km between any two different cities)
vi.mock('../routing.js', () => ({
  getDistance:     vi.fn((a, b) => (a === b ? 0 : 100)),
  buildRouteStops: vi.fn(() => []),
  routeDistance:   vi.fn(() => 0),
}));

// truck_small: speed 80 km/h, fuelCapacity 150 L, fuelConsumption 18 L/100 km
const CATALOG_ID = 'truck_small';
// With speedMod=1.0: kmPerMinute = 80/60 ≈ 1.333…
// legDist=100, progressPct=50 → legRemaining=50 → minutes = 50/(80/60) = 37.5

function makeVehicle(overrides = {}) {
  return {
    id: 'v1',
    name: 'Test LKW',
    catalogId: CATALOG_ID,
    status: 'driving',
    fuel: 150,       // full tank → no refueling triggers
    odometer: 0,
    health: 100,
    refuelPauseMinutes: 0,
    orderQueue: [],
    route: {
      currentStopIndex: 0,
      progressPct: 50,   // halfway through the current leg
      coveredDistance: 0,
      stops: [
        { cityId: 'cityA', action: 'depart' },
        { cityId: 'cityB', action: 'delivery' },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  GS.started = true;
  GS.paused  = false;
  GS.vehicles = [];
  GS.time     = { day: 1, month: 3, year: 1994, hour: 8, minute: 0, totalMinutes: 0 };
  GS.market   = { fuelPrice: 1.65, speedMod: 1.0, orderValueMod: 1.0, orderVolumeMod: 1.0, activeEvents: [] };
  GS.orders   = { available: [], active: [], completed: [], declined: [] };
  GS.stats    = { kmDriven: 0, totalRevenue: 0, totalExpenses: 0, ordersCompleted: 0, ordersFailed: 0 };
  GS.finance  = { balance: 50000, monthRevenue: 0, monthExpenses: 0, transactions: [] };
  GS.staff    = [];
  GS.messageLog = [];
  GS.ui = {
    lastOrderCheckMin: 0, lastEventCheckMin: 0, lastRenderMs: 0,
    currentScreen: 'fleet', selectedVehicleId: null,
  };
});

describe('jumpToNextEvent', () => {
  it('shows info toast and does not advance time when no vehicles are driving', async () => {
    const { showToast } = await import('../ui/notifications.js');
    showToast.mockClear();

    GS.vehicles = [];
    jumpToNextEvent();

    expect(showToast).toHaveBeenCalledWith('Keine Fahrzeuge unterwegs', 'info');
    expect(GS.time.totalMinutes).toBe(0);
  });

  it('advances to the correct time using Math.ceil for a mid-leg vehicle (progressPct=50%)', () => {
    // legDist=100, progressPct=50 → legRemaining=50
    // speed=80 km/h, speedMod=1.0 → kmPerMinute=80/60
    // minutes = 50 / (80/60) = 37.5 → Math.ceil(37.5) = 38
    GS.vehicles = [makeVehicle()];
    jumpToNextEvent();
    expect(GS.time.totalMinutes).toBe(38);
  });

  it('includes an active refuelPauseMinutes in the advance calculation', () => {
    // refuelPauseMinutes=5 + legRemaining/speed=37.5 = 42.5 → Math.ceil = 43
    GS.vehicles = [makeVehicle({ refuelPauseMinutes: 5, fuel: 10 })];
    jumpToNextEvent();
    expect(GS.time.totalMinutes).toBe(43);
  });

  it('adds REFUEL_DURATION_MINUTES when vehicle has an active refuel pause of that duration', () => {
    // refuelPauseMinutes=REFUEL_DURATION_MINUTES (15) + legRemaining/speed=37.5 = 52.5 → Math.ceil = 53
    GS.vehicles = [makeVehicle({ refuelPauseMinutes: REFUEL_DURATION_MINUTES })];
    jumpToNextEvent();
    expect(GS.time.totalMinutes).toBe(REFUEL_DURATION_MINUTES + 38); // 15 + 38 = 53
  });

  it('picks the minimum advance across multiple vehicles', () => {
    // v1: progressPct=50, legRemaining=50 → 37.5 min
    // v2: progressPct=75, legRemaining=25 → 18.75 min → ceil=19
    GS.vehicles = [
      makeVehicle({ id: 'v1' }),
      makeVehicle({ id: 'v2', route: {
        currentStopIndex: 0,
        progressPct: 75,
        coveredDistance: 0,
        stops: [
          { cityId: 'cityA', action: 'depart' },
          { cityId: 'cityB', action: 'delivery' },
        ],
      }}),
    ];
    jumpToNextEvent();
    expect(GS.time.totalMinutes).toBe(19);
  });
});
