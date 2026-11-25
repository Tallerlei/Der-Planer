import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchTour, releaseDueContractOrders, tickVehicles } from '../game/engine.js';
import { createStarterContract, ensureContracts, recordContractFailure } from '../game/contracts.js';
import { GS } from '../state.js';

vi.mock('../ui/notifications.js', () => ({ showToast: vi.fn(), showTimeAdvance: vi.fn(), addLogEntry: vi.fn() }));
vi.mock('../ui/statusbar.js', () => ({ updateStatusBar: vi.fn() }));
vi.mock('../game/save.js', () => ({ autoSave: vi.fn(), loadGame: vi.fn() }));

function order(id, origin, destination, value = 1000) {
  return {
    id, clientId: 'c01', clientName: 'Müller', origin, destination,
    cargoDesc: 'Fracht', cargoType: 'food', weight: 2000,
    remainingWeight: 2000, tripsCompleted: 0, requirements: [],
    value, bonus: 0, penalty: 100, deadlineDays: 4,
    receivedMinute: 0, receivedAt: null, expiresInDays: 2,
    status: 'available', vehicleId: null,
  };
}

function resetState() {
  GS.started = true;
  GS.paused = false;
  GS.company = {
    ...GS.company,
    difficulty: 'normal',
    reputation: 50,
    hqCity: 'frankfurt',
  };
  GS.time = { day: 1, month: 3, year: 1994, hour: 8, minute: 0, totalMinutes: 480 };
  GS.market = { fuelPrice: 1.65, speedMod: 1, orderValueMod: 1, orderVolumeMod: 1, activeEvents: [] };
  GS.finance = { balance: 50000, monthRevenue: 0, monthExpenses: 0, transactions: [], loans: [] };
  GS.stats = { totalRevenue: 0, totalExpenses: 0, ordersCompleted: 0, ordersFailed: 0, kmDriven: 0 };
  GS.staff = [{ id: 'd1', role: 'driver', skill: 2, xp: 0, deliveries: 0, satisfaction: 80 }];
  GS.vehicles = [{
    id: 'v1', name: 'Transporter', catalogId: 'transit', status: 'idle',
    driverId: 'd1', currentCity: 'frankfurt', homeCity: 'frankfurt',
    fuel: 70, health: 100, odometer: 0, refuelPauseMinutes: 0, stopMinutes: 0,
    route: { stops: [], currentStopIndex: 0, progressPct: 0, totalDistance: 0, coveredDistance: 0 },
    orderQueue: [], position: { x: 0, y: 0 },
  }];
  GS.staff[0].vehicleId = 'v1';
  GS.orders = { available: [], active: [], completed: [], declined: [] };
  GS.contracts = [];
  GS.clientStats = {};
  GS.clientReputation = {};
  GS.messageLog = [];
  GS.progress = null;
  GS.ui = {
    lastOrderCheckMin: 480, lastEventCheckMin: 480, lastRenderMs: 0,
    currentScreen: 'orders', selectedVehicleId: null, orderSort: { field: 'value', dir: 'desc' },
  };
}

beforeEach(resetState);

describe('dispatchTour', () => {
  it('moves several orders onto one route and leaves the vehicle at the final destination', () => {
    const first = order('o1', 'frankfurt', 'hamburg', 1500);
    const second = order('o2', 'hamburg', 'berlin', 900);
    GS.orders.available = [first, second];

    expect(dispatchTour('v1', ['o1', 'o2'], false)).toBe(true);
    expect(GS.orders.available).toHaveLength(0);
    expect(GS.orders.active.map(item => item.id)).toEqual(['o1', 'o2']);
    expect(GS.vehicles[0].plannedTour.orderIds).toEqual(['o1', 'o2']);

    tickVehicles(6000);
    expect(GS.vehicles[0].status).toBe('idle');
    expect(GS.vehicles[0].currentCity).toBe('berlin');
    expect(GS.orders.completed.map(item => item.id)).toEqual(['o2', 'o1']);
    expect(GS.vehicles[0].plannedTour).toBeUndefined();
  });

  it('rejects an order larger than the vehicle capacity without moving any order', () => {
    const tooHeavy = order('o1', 'frankfurt', 'hamburg');
    tooHeavy.weight = 4000;
    GS.orders.available = [tooHeavy];

    expect(dispatchTour('v1', ['o1'], false)).toBe(false);
    expect(GS.orders.available).toEqual([tooHeavy]);
    expect(GS.orders.active).toHaveLength(0);
    expect(GS.vehicles[0].status).toBe('idle');
  });

  it('plans a mandatory rest instead of silently exceeding the driver shift', () => {
    GS.staff[0].drivingMinutesToday = 9 * 60;
    GS.staff[0].skill = 1;
    GS.orders.available = [order('o1', 'frankfurt', 'helsinki')];

    expect(dispatchTour('v1', ['o1'], false)).toBe(true);
    expect(GS.orders.available).toHaveLength(0);
    expect(GS.vehicles[0].status).toBe('driving');
    expect(GS.staff[0].restUntilMinute).toBeGreaterThan(GS.time.totalMinutes);
  });

  it('simulates a running route stop when shift time is exhausted', () => {
    GS.time.totalMinutes = 600;
    GS.staff[0].skill = 1;
    GS.staff[0].drivingMinutesToday = 539;
    GS.vehicles[0].status = 'driving';
    GS.vehicles[0].route = {
      currentStopIndex: 0,
      progressPct: 0,
      coveredDistance: 0,
      totalDistance: 100,
      stops: [
        { cityId: 'frankfurt', action: 'depart' },
        { cityId: 'hamburg', action: 'return' },
      ],
    };

    tickVehicles(120);

    expect(GS.staff[0].restUntilMinute).toBe(1141);
    expect(GS.staff[0].drivingMinutesToday).toBeCloseTo(540);
    expect(GS.vehicles[0].route.progressPct).toBeLessThan(5);
  });
});

describe('weekly contracts', () => {
  it('releases one promised order and schedules the next week', () => {
    GS.contracts = [createStarterContract(480)];

    expect(releaseDueContractOrders()).toBe(1);
    expect(GS.orders.available).toHaveLength(1);
    expect(GS.orders.available[0]).toMatchObject({
      clientId: 'c01',
      isContract: true,
      origin: 'frankfurt',
      destination: 'hamburg',
    });
    expect(GS.contracts[0].nextReleaseMinute).toBe(480 + 7 * 1440);
  });

  it('cancels the contract after three missed contract loads', () => {
    const contract = createStarterContract(480);
    GS.contracts = [contract];

    recordContractFailure(contract);
    recordContractFailure(contract);
    recordContractFailure(contract);

    expect(ensureContracts()[0].active).toBe(false);
    expect(ensureContracts()[0].missedDeliveries).toBe(3);
  });

  it('counts genuinely overdue weekly loads as missed when time is skipped', () => {
    const contract = createStarterContract(480);
    GS.contracts = [contract];
    GS.time.totalMinutes = 480 + 30 * 1440;

    releaseDueContractOrders();

    expect(contract.active).toBe(false);
    expect(contract.missedDeliveries).toBe(3);
    expect(GS.orders.available).toHaveLength(0);
    expect(GS.stats.ordersFailed).toBe(3);
  });
});
