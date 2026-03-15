import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getVehicleActiveOrderId, moveOrderInQueue, reassignOrder, isCargoLoaded, acceptOrder } from '../game/engine.js';
import { isVehicleReturningToBase } from '../game/vehicles.js';
import { GS } from '../state.js';

// Stub out DOM-dependent helpers so tests can run without a browser
vi.mock('../ui/notifications.js', () => ({ showToast: vi.fn(), showTimeAdvance: vi.fn(), addLogEntry: vi.fn() }));
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

describe('acceptOrder – Standort und km-Stand stabil bei fahrendem Fahrzeug', () => {
  beforeEach(() => {
    global.document = { getElementById: vi.fn(() => null) };

    // Vehicle returning to base: delivery done, heading from Berlin back to Frankfurt
    // currentStopIndex=2 → driving from stops[2](Berlin) to stops[3](Frankfurt)
    // progressPct=50 → mid-leg (Berlin→Frankfurt ≈ 144 km, remaining ≈ 72 km > 40 km/30min)
    GS.vehicles = [
      {
        id: 'v1',
        catalogId: 'truck_small',
        name: 'LKW 1',
        status: 'driving',
        driverId: 'driver1',
        currentCity: 'berlin',
        homeCity: 'frankfurt',
        orderQueue: [],
        fuel: 150,
        health: 100,
        odometer: 500,
        refuelPauseMinutes: 0,
        trailerId: null,
        route: {
          stops: [
            { cityId: 'frankfurt', action: 'depart' },
            { cityId: 'hamburg',   action: 'pickup',   orderId: 'o1' },
            { cityId: 'berlin',    action: 'delivery', orderId: 'o1' },
            { cityId: 'frankfurt', action: 'return' },
          ],
          currentStopIndex: 2,
          progressPct: 50,
          totalDistance: 700,
          coveredDistance: 350,
        },
        position: { x: 421, y: 228 },
      },
    ];

    GS.orders = {
      available: [
        {
          id: 'o2',
          clientId: 'c01',
          clientName: 'Test Client',
          cargoDesc: 'Testfracht',
          origin: 'hamburg',
          destination: 'muenchen',
          weight: 3000,
          remainingWeight: 3000,
          requirements: [],
          value: 1000,
          bonus: 100,
          penalty: 50,
          deadlineDays: 3,
          expiresInDays: 2,
          receivedMinute: 0,
          tripsCompleted: 0,
          status: 'available',
        },
      ],
      active: [
        {
          id: 'o1',
          vehicleId: 'v1',
          clientId: 'c01',
          status: 'accepted',
          weight: 7500,
          remainingWeight: 7500,
          origin: 'hamburg',
          destination: 'berlin',
          requirements: [],
          acceptedMinute: 0,
          deadlineDays: 3,
          value: 800,
          bonus: 50,
          penalty: 30,
        },
      ],
      completed: [],
      declined: [],
    };

    GS.time = { totalMinutes: 0, day: 1, month: 3, year: 1994, hour: 8, minute: 0 };
    GS.stats = { kmDriven: 0, ordersCompleted: 0, ordersFailed: 0, totalRevenue: 0, totalExpenses: 0 };
    GS.market = { speedMod: 1, fuelPrice: 1.65, activeEvents: [] };
    GS.finance = { balance: 10000, monthRevenue: 0, monthExpenses: 0, transactions: [] };
    GS.company = { reputation: 50, difficulty: 'normal', hqCity: 'frankfurt' };
    GS.ui = {
      lastOrderCheckMin: -9999,
      lastEventCheckMin: -9999,
      orderVehicleSelection: {},
      currentScreen: null,
      lastRenderMs: 0,
    };
    GS.clientReputation = {};
    GS.clientStats = {};
    GS.staff = [
      { id: 'driver1', role: 'driver', vehicleId: 'v1', name: 'Max Mustermann', salary: 2400, satisfaction: 70, skill: 3 },
    ];
    GS.trailers = [];
    GS.notifications = [];
    GS.messageLog = [];
  });

  it('Auftrag wird eingereiht wenn Fahrzeug noch einen aktiven Auftrag fährt (nicht auf Rückfahrt)', () => {
    const vehicle = GS.vehicles[0];
    // Set vehicle to be on its way TO pickup (not returning yet)
    vehicle.route.currentStopIndex = 0;

    expect(isVehicleReturningToBase(vehicle)).toBe(false);

    acceptOrder('o2', 'v1');

    // New order must be queued, NOT started directly
    expect(vehicle.orderQueue).toContain('o2');
    expect(vehicle.orderQueue).toHaveLength(1);

    // Route should still contain the original pickup/delivery stops (not replaced by o2)
    const hasO2Pickup   = vehicle.route.stops.some(s => s.orderId === 'o2' && s.action === 'pickup');
    const hasO2Delivery = vehicle.route.stops.some(s => s.orderId === 'o2' && s.action === 'delivery');
    expect(hasO2Pickup).toBe(false);
    expect(hasO2Delivery).toBe(false);
  });

  it('Auftrag wird sofort gestartet wenn Fahrzeug zur Basis zurückkehrt', () => {
    const vehicle = GS.vehicles[0];

    // Confirm the vehicle is currently returning to base (isVehicleReturningToBase = true)
    expect(isVehicleReturningToBase(vehicle)).toBe(true);

    acceptOrder('o2', 'v1');

    // New order must be started directly, NOT queued
    expect(vehicle.orderQueue).not.toContain('o2');
    expect(vehicle.orderQueue).toHaveLength(0);

    // Vehicle should be driving the new order's route
    expect(vehicle.status).toBe('driving');

    // Route should now contain o2's pickup and delivery stops
    const hasO2Pickup   = vehicle.route.stops.some(s => s.orderId === 'o2' && s.action === 'pickup');
    const hasO2Delivery = vehicle.route.stops.some(s => s.orderId === 'o2' && s.action === 'delivery');
    expect(hasO2Pickup).toBe(true);
    expect(hasO2Delivery).toBe(true);
  });

  it('Auftrag wird sofort gestartet wenn Fahrzeug bereit (idle)', () => {
    GS.vehicles[0].status = 'idle';
    GS.vehicles[0].route = {
      stops: [],
      currentStopIndex: 0,
      progressPct: 0,
      totalDistance: 0,
      coveredDistance: 0,
    };

    const vehicle = GS.vehicles[0];
    acceptOrder('o2', 'v1');

    expect(vehicle.status).toBe('driving');
    expect(vehicle.orderQueue).toHaveLength(0);

    const hasO2Pickup   = vehicle.route.stops.some(s => s.orderId === 'o2' && s.action === 'pickup');
    const hasO2Delivery = vehicle.route.stops.some(s => s.orderId === 'o2' && s.action === 'delivery');
    expect(hasO2Pickup).toBe(true);
    expect(hasO2Delivery).toBe(true);
  });
});
