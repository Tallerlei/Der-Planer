import { describe, it, expect, beforeEach, vi } from 'vitest';
import { advanceGameTime } from '../game/engine.js';
import { GS } from '../state.js';

// Stub out DOM-dependent helpers so tests can run without a browser
vi.mock('../ui/notifications.js', () => ({ showToast: vi.fn(), showTimeAdvance: vi.fn(), addLogEntry: vi.fn() }));
vi.mock('../ui/statusbar.js',     () => ({ updateStatusBar: vi.fn() }));
vi.mock('../game/save.js',        () => ({ autoSave: vi.fn(), loadGame: vi.fn() }));
vi.mock('../ui/modal.js',         () => ({ openModal: vi.fn(), closeModal: vi.fn() }));
vi.mock('../routing.js', () => ({
  getDistance:     vi.fn((a, b) => (a === b ? 0 : 100)),
  buildRouteStops: vi.fn(() => []),
  routeDistance:   vi.fn(() => 0),
}));

beforeEach(() => {
  GS.started  = true;
  GS.paused   = false;
  GS.vehicles = [];
  GS.trailers = [];
  GS.time     = { day: 1, month: 3, year: 1994, hour: 8, minute: 0, totalMinutes: 480 };
  GS.market   = { fuelPrice: 1.65, speedMod: 1.0, orderValueMod: 1.0, orderVolumeMod: 1.0, activeEvents: [] };
  GS.orders   = { available: [], active: [], completed: [], declined: [] };
  GS.stats    = { kmDriven: 0, totalRevenue: 0, totalExpenses: 0, ordersCompleted: 0, ordersFailed: 0 };
  GS.finance  = { balance: 50000, monthRevenue: 0, monthExpenses: 0, transactions: [] };
  GS.staff    = [];
  GS.messageLog = [];
  GS.company  = { name: 'Test GmbH', mode: 'sandbox', difficulty: 'normal', hqCity: 'frankfurt', reputationTier: 1 };
  GS.clientReputation = {};
  GS.clientStats      = {};
  GS.ui = {
    // Set far in the future so order/event checks never trigger during short test advances
    lastOrderCheckMin: 9_999_999, lastEventCheckMin: 9_999_999,
    lastRenderMs: 0, lastSalaryDay: 1,
    currentScreen: 'fleet', selectedVehicleId: null,
    mapZoom: 1, mapCenter: { x: 400, y: 260 },
    orderSort: { field: 'value', dir: 'desc' },
  };
});

describe('Automatisches Speichern nach Tageswechsel', () => {
  it('ruft autoSave auf, wenn ein Tageswechsel stattfindet', async () => {
    const { autoSave } = await import('../game/save.js');
    autoSave.mockClear();

    // 23 h 50 min into the first day – 10 min before midnight
    GS.time.totalMinutes = 1430;

    // Advance 15 minutes → crosses the 1440-minute boundary (day change)
    advanceGameTime(15);

    expect(autoSave).toHaveBeenCalledTimes(1);
  });

  it('ruft autoSave nicht auf, wenn kein Tageswechsel stattfindet', async () => {
    const { autoSave } = await import('../game/save.js');
    autoSave.mockClear();

    // Well within the first day
    GS.time.totalMinutes = 100;

    // Advance 15 minutes → stays within the same day
    advanceGameTime(15);

    expect(autoSave).not.toHaveBeenCalled();
  });

  it('ruft autoSave genau einmal auf, auch wenn mehrere Tage übersprungen werden', async () => {
    const { autoSave } = await import('../game/save.js');
    autoSave.mockClear();

    GS.time.totalMinutes = 100;

    // Advance more than two full days – still triggers the save block only once
    advanceGameTime(3000);

    expect(autoSave).toHaveBeenCalledTimes(1);
  });
});
