import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getVehicleActiveOrderId, moveOrderInQueue } from '../game/engine.js';
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
