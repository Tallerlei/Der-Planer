import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getVehicleActiveOrderId, moveOrderInQueue, reassignOrder, isCargoLoaded } from '../game/engine.js';
import { isVehicleReturningToBase } from '../game/vehicles.js';
import { GS } from '../state.js';

// Stub out DOM-dependent helpers so tests can run without a browser
vi.mock('../ui/notifications.js', () => ({ showToast: vi.fn(), showTimeAdvance: vi.fn() }));
vi.mock('../ui/statusbar.js',     () => ({ updateStatusBar: vi.fn() }));
vi.mock('../game/save.js',        () => ({ autoSave: vi.fn(), loadGame: vi.fn() }));

describe('getVehicleActiveOrderId', () => {
  it('returns null for idle vehicle', () => {
    const v = { id: 'v1', status: 'idle', route: { stops: [] } };
    expect(getVehicleActiveOrderId(v)).toBeNull();
  });

  it('returns null when driving but no order stops', () => {
    const v = {
      id: 'v1',
      status: 'driving',
      route: {
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'berlin',    action: 'transit' },
        ],
      },
    };
    expect(getVehicleActiveOrderId(v)).toBeNull();
  });

  it('returns orderId from pickup stop', () => {
    const v = {
      id: 'v1',
      status: 'driving',
      route: {
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'hamburg',   action: 'pickup',   orderId: 'o1' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(getVehicleActiveOrderId(v)).toBe('o1');
  });

  it('returns orderId from delivery stop when pickup already processed', () => {
    const v = {
      id: 'v1',
      status: 'driving',
      route: {
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o2' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(getVehicleActiveOrderId(v)).toBe('o2');
  });

  it('returns null for null/undefined vehicle', () => {
    expect(getVehicleActiveOrderId(null)).toBeNull();
    expect(getVehicleActiveOrderId(undefined)).toBeNull();
  });
});

describe('moveOrderInQueue', () => {
  beforeEach(() => {
    GS.vehicles = [
      {
        id: 'v1',
        status: 'driving',
        orderQueue: ['o1', 'o2', 'o3'],
        route: { stops: [] },
      },
    ];
  });

  it('moves order from higher to lower index (up)', () => {
    moveOrderInQueue('v1', 1, 0);
    expect(GS.vehicles[0].orderQueue).toEqual(['o2', 'o1', 'o3']);
  });

  it('moves order from lower to higher index (down)', () => {
    moveOrderInQueue('v1', 0, 2);
    expect(GS.vehicles[0].orderQueue).toEqual(['o2', 'o3', 'o1']);
  });

  it('does nothing for out-of-bounds fromIdx', () => {
    moveOrderInQueue('v1', 5, 0);
    expect(GS.vehicles[0].orderQueue).toEqual(['o1', 'o2', 'o3']);
  });

  it('does nothing for out-of-bounds toIdx', () => {
    moveOrderInQueue('v1', 0, 10);
    expect(GS.vehicles[0].orderQueue).toEqual(['o1', 'o2', 'o3']);
  });

  it('does nothing when vehicleId is unknown', () => {
    moveOrderInQueue('unknown', 0, 1);
    expect(GS.vehicles[0].orderQueue).toEqual(['o1', 'o2', 'o3']);
  });

  it('moving to same index leaves queue unchanged', () => {
    moveOrderInQueue('v1', 1, 1);
    expect(GS.vehicles[0].orderQueue).toEqual(['o1', 'o2', 'o3']);
  });
});

describe('isVehicleReturningToBase', () => {
  it('returns false for an idle vehicle', () => {
    const v = { status: 'idle', route: { stops: [], currentStopIndex: 0 } };
    expect(isVehicleReturningToBase(v)).toBe(false);
  });

  it('returns false when upcoming stops include a pickup', () => {
    const v = {
      status: 'driving',
      route: {
        currentStopIndex: 0,
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'hamburg',   action: 'pickup',   orderId: 'o1' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(isVehicleReturningToBase(v)).toBe(false);
  });

  it('returns false when upcoming stops include a delivery', () => {
    const v = {
      status: 'driving',
      route: {
        currentStopIndex: 1,
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'hamburg',   action: 'pickup',   orderId: 'o1' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(isVehicleReturningToBase(v)).toBe(false);
  });

  it('returns true when all remaining stops are transit/return (after delivery)', () => {
    const v = {
      status: 'driving',
      route: {
        currentStopIndex: 2,
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'hamburg',   action: 'pickup',   orderId: 'o1' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
          { cityId: 'cologne',   action: 'transit' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(isVehicleReturningToBase(v)).toBe(true);
  });

  it('returns true when at the last transit stop before return', () => {
    const v = {
      status: 'driving',
      route: {
        currentStopIndex: 3,
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
          { cityId: 'cologne',   action: 'transit' },
          { cityId: 'mainz',     action: 'transit' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(isVehicleReturningToBase(v)).toBe(true);
  });

  it('returns true when no stops remain ahead (at final stop)', () => {
    const v = {
      status: 'driving',
      route: {
        currentStopIndex: 3,
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
          { cityId: 'cologne',   action: 'transit' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(isVehicleReturningToBase(v)).toBe(true);
  });
});

describe('isCargoLoaded', () => {
  it('returns false for an idle vehicle', () => {
    const v = { status: 'idle', route: { stops: [], currentStopIndex: 0 } };
    expect(isCargoLoaded(v, 'o1')).toBe(false);
  });

  it('returns false when vehicle has not yet reached the pickup stop', () => {
    const v = {
      status: 'driving',
      route: {
        currentStopIndex: 0,
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'hamburg',   action: 'pickup',   orderId: 'o1' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(isCargoLoaded(v, 'o1')).toBe(false);
  });

  it('returns false when currentStopIndex equals pickup stop index (at pickup, not past it)', () => {
    const v = {
      status: 'driving',
      route: {
        currentStopIndex: 1,
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'hamburg',   action: 'pickup',   orderId: 'o1' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(isCargoLoaded(v, 'o1')).toBe(false);
  });

  it('returns true when vehicle is past the pickup stop (cargo loaded)', () => {
    const v = {
      status: 'driving',
      route: {
        currentStopIndex: 2,
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'hamburg',   action: 'pickup',   orderId: 'o1' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(isCargoLoaded(v, 'o1')).toBe(true);
  });

  it('returns false when pickup stop does not exist for the given orderId', () => {
    const v = {
      status: 'driving',
      route: {
        currentStopIndex: 2,
        stops: [
          { cityId: 'frankfurt', action: 'depart' },
          { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
          { cityId: 'frankfurt', action: 'return' },
        ],
      },
    };
    expect(isCargoLoaded(v, 'o1')).toBe(false);
  });
});

describe('reassignOrder – pre-pickup active order', () => {
  const mockData = {
    VEHICLES: [{ id: 'cat1', name: 'LKW', capacity: 5000, requirements: [], speed: 80, fuelCapacity: 300, fuelConsumption: 30, maintenanceCostPerMonth: 500 }],
  };

  beforeEach(() => {
    // Inject minimal DATA mock
    vi.doMock('../data.js', () => ({ DATA: mockData }));

    // Stub browser DOM so reassignOrder's document.getElementById guard works
    global.document = { getElementById: vi.fn(() => null) };

    GS.vehicles = [
      {
        id: 'v1',
        name: 'Fahrzeug 1',
        catalogId: 'cat1',
        status: 'driving',
        driverId: 'driver1',
        currentCity: 'cologne',
        homeCity: 'frankfurt',
        orderQueue: [],
        route: {
          stops: [
            { cityId: 'frankfurt', action: 'depart' },
            { cityId: 'hamburg',   action: 'pickup',   orderId: 'o1' },
            { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
            { cityId: 'frankfurt', action: 'return' },
          ],
          currentStopIndex: 0,
          progressPct: 0,
          totalDistance: 500,
          coveredDistance: 0,
        },
        position: { x: 0, y: 0 },
      },
      {
        id: 'v2',
        name: 'Fahrzeug 2',
        catalogId: 'cat1',
        status: 'idle',
        driverId: 'driver2',
        currentCity: 'frankfurt',
        homeCity: 'frankfurt',
        orderQueue: [],
        route: { stops: [], currentStopIndex: 0, progressPct: 0, totalDistance: 0, coveredDistance: 0 },
        position: { x: 0, y: 0 },
      },
    ];

    GS.orders = {
      active: [
        {
          id: 'o1',
          vehicleId: 'v1',
          status: 'accepted',
          weight: 3000,
          remainingWeight: 3000,
          origin: 'hamburg',
          destination: 'berlin',
          requirements: [],
        },
      ],
      available: [],
      completed: [],
      declined: [],
    };

    GS.time = { totalMinutes: 0 };
    GS.stats = { kmDriven: 0 };
    GS.market = { speedMod: 1, fuelPrice: 1.5 };
    GS.finance = { balance: 10000, monthRevenue: 0, monthExpenses: 0, transactions: [] };
    GS.company = { reputation: 50 };
    GS.ui = {};
  });

  it('allows reassigning an active order before cargo is picked up', () => {
    reassignOrder('o1', 'v2');
    // v1 should be idle now (no queued orders)
    expect(GS.vehicles.find(v => v.id === 'v1').status).toBe('idle');
    // order should reference v2
    expect(GS.orders.active.find(o => o.id === 'o1').vehicleId).toBe('v2');
    // v2 should be driving (started order)
    expect(GS.vehicles.find(v => v.id === 'v2').status).toBe('driving');
  });

  it('blocks reassignment after cargo has been picked up', () => {
    // Simulate that v1 has passed the pickup stop
    GS.vehicles[0].route.currentStopIndex = 2;
    reassignOrder('o1', 'v2');
    // v1 should still be driving (reassignment refused)
    expect(GS.vehicles.find(v => v.id === 'v1').status).toBe('driving');
    // order should still belong to v1
    expect(GS.orders.active.find(o => o.id === 'o1').vehicleId).toBe('v1');
  });
});
