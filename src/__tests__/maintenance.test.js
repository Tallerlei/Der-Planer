import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceGameTime, jumpToNextEvent } from '../game/engine.js';
import { loadGame } from '../game/save.js';
import { GS } from '../state.js';

vi.mock('../ui/notifications.js', () => ({
  showToast: vi.fn(),
  showTimeAdvance: vi.fn(),
  addLogEntry: vi.fn(),
}));
vi.mock('../ui/statusbar.js', () => ({ updateStatusBar: vi.fn() }));
vi.mock('../ui/modal.js', () => ({ openModal: vi.fn(), closeModal: vi.fn(), queueModal: vi.fn() }));
vi.mock('../routing.js', () => ({
  getDistance: vi.fn((a, b) => (a === b ? 0 : 100)),
  buildRouteStops: vi.fn(stops => stops),
  routeDistance: vi.fn(() => 0),
}));

const storage = new Map();

beforeEach(() => {
  storage.clear();
  global.localStorage = {
    getItem: vi.fn(key => storage.get(key) ?? null),
    setItem: vi.fn((key, value) => storage.set(key, value)),
    removeItem: vi.fn(key => storage.delete(key)),
  };

  GS.started = true;
  GS.paused = false;
  GS.time = { day: 1, month: 3, year: 1994, hour: 8, minute: 0, totalMinutes: 480 };
  GS.company = { difficulty: 'normal', hqCity: 'frankfurt', reputation: 50 };
  GS.finance = { balance: 50000, monthRevenue: 0, monthExpenses: 0, transactions: [], loans: [] };
  GS.stats = { totalRevenue: 0, totalExpenses: 0, ordersCompleted: 0, ordersFailed: 0, kmDriven: 0 };
  GS.market = { fuelPrice: 1.65, speedMod: 1, orderValueMod: 1, orderVolumeMod: 1, activeEvents: [] };
  GS.orders = { available: [], active: [], completed: [], declined: [] };
  GS.staff = [];
  GS.trailers = [];
  GS.ui = {
    lastOrderCheckMin: 9_999_999,
    lastEventCheckMin: 9_999_999,
    lastRenderMs: Date.now(),
    currentScreen: 'fleet',
  };
  GS.vehicles = [{
    id: 'v1',
    name: 'Transporter 1',
    catalogId: 'transit',
    status: 'maintenance',
    health: 45,
    currentCity: 'frankfurt',
    maintenanceUntilMinute: 600,
    position: { x: 0, y: 0 },
    route: { stops: [], currentStopIndex: 0, progressPct: 0, totalDistance: 0, coveredDistance: 0 },
  }];
});

describe('Wartung in Spielzeit', () => {
  it('schließt die Wartung erst am gespeicherten Endzeitpunkt ab', () => {
    advanceGameTime(119);

    expect(GS.vehicles[0].status).toBe('maintenance');
    expect(GS.vehicles[0].health).toBe(45);

    advanceGameTime(1);

    expect(GS.vehicles[0].status).toBe('idle');
    expect(GS.vehicles[0].health).toBe(100);
    expect(GS.vehicles[0]).not.toHaveProperty('maintenanceUntilMinute');
  });

  it('springt zum Ende einer Wartung, wenn kein Fahrzeug fährt', () => {
    jumpToNextEvent();

    expect(GS.time.totalMinutes).toBe(600);
    expect(GS.vehicles[0].status).toBe('idle');
  });

  it('bereinigt alte Wartungszustände ohne Endzeit beim Laden', () => {
    delete GS.vehicles[0].maintenanceUntilMinute;
    storage.set('derplaner_save', JSON.stringify(GS));

    expect(loadGame()).toBe(true);
    expect(GS.vehicles[0].status).toBe('idle');
    expect(GS.vehicles[0].health).toBe(100);
  });

  it('setzt eine bereits abgelaufene Wartung beim Laden auf bereit', () => {
    GS.vehicles[0].maintenanceUntilMinute = 400;
    storage.set('derplaner_save', JSON.stringify(GS));

    expect(loadGame()).toBe(true);
    expect(GS.vehicles[0].status).toBe('idle');
    expect(GS.vehicles[0]).not.toHaveProperty('maintenanceUntilMinute');
  });
});
