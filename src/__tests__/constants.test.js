import { describe, it, expect } from 'vitest';
import {
  APP_VERSION, TIME_COSTS, REFUEL_THRESHOLD, REFUEL_DURATION_MINUTES,
  RENDER_THROTTLE_MS, TOAST_DISPLAY_MS, ORDER_POOL_MULTIPLIER, MINUTES_PER_TICK,
  REP_TIER_MAX_WEIGHT, REQ_LABELS, FLEET_COMPATIBLE_ORDER_RATIO,
  VEHICLE_STATUS_INFO, NEXT_ACTION_LABELS,
  BASE_MIN_KM_PRICE, BASE_MAX_KM_PRICE, CARGO_TYPE_KM_FACTORS,
} from '../constants.js';

describe('APP_VERSION', () => {
  it('is a valid semver string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('TIME_COSTS', () => {
  it('has all required action costs', () => {
    const expected = ['navigate', 'assignOrder', 'dispatchRoute', 'hireStaff',
      'fireStaff', 'buyVehicle', 'sellVehicle', 'maintenance', 'repair',
      'assignDriver', 'removeDriver', 'takeLoan', 'refreshCand',
      'buyTrailer', 'detachTrailer', 'attachTrailer'];
    for (const key of expected) {
      expect(TIME_COSTS).toHaveProperty(key);
      expect(typeof TIME_COSTS[key]).toBe('number');
      expect(TIME_COSTS[key]).toBeGreaterThan(0);
    }
  });
});

describe('REFUEL_THRESHOLD', () => {
  it('is between 0 and 1', () => {
    expect(REFUEL_THRESHOLD).toBeGreaterThan(0);
    expect(REFUEL_THRESHOLD).toBeLessThan(1);
  });
});

describe('REFUEL_DURATION_MINUTES', () => {
  it('is a positive number', () => {
    expect(REFUEL_DURATION_MINUTES).toBeGreaterThan(0);
  });
});

describe('REP_TIER_MAX_WEIGHT', () => {
  it('has entries for tiers 1-5', () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(REP_TIER_MAX_WEIGHT).toHaveProperty(String(tier));
    }
  });

  it('weights are ascending', () => {
    expect(REP_TIER_MAX_WEIGHT[1]).toBeLessThan(REP_TIER_MAX_WEIGHT[2]);
    expect(REP_TIER_MAX_WEIGHT[2]).toBeLessThan(REP_TIER_MAX_WEIGHT[3]);
    expect(REP_TIER_MAX_WEIGHT[3]).toBeLessThan(REP_TIER_MAX_WEIGHT[4]);
    expect(REP_TIER_MAX_WEIGHT[4]).toBeLessThan(REP_TIER_MAX_WEIGHT[5]);
    expect(REP_TIER_MAX_WEIGHT[5]).toBe(Infinity);
  });
});

describe('REQ_LABELS', () => {
  it('has labels for known requirements', () => {
    expect(REQ_LABELS).toHaveProperty('cooling');
    expect(REQ_LABELS).toHaveProperty('adr');
    expect(REQ_LABELS).toHaveProperty('heavy_load');
  });
});

describe('FLEET_COMPATIBLE_ORDER_RATIO', () => {
  it('is a number between 0 and 1', () => {
    expect(typeof FLEET_COMPATIBLE_ORDER_RATIO).toBe('number');
    expect(FLEET_COMPATIBLE_ORDER_RATIO).toBeGreaterThan(0);
    expect(FLEET_COMPATIBLE_ORDER_RATIO).toBeLessThanOrEqual(1);
  });
});

describe('VEHICLE_STATUS_INFO', () => {
  it('has entries for all standard vehicle statuses', () => {
    for (const status of ['idle', 'driving', 'maintenance', 'broken']) {
      expect(VEHICLE_STATUS_INFO).toHaveProperty(status);
      expect(VEHICLE_STATUS_INFO[status]).toHaveProperty('badge');
      expect(VEHICLE_STATUS_INFO[status]).toHaveProperty('label');
    }
  });

  it('labels are non-empty German strings', () => {
    for (const info of Object.values(VEHICLE_STATUS_INFO)) {
      expect(typeof info.label).toBe('string');
      expect(info.label.length).toBeGreaterThan(0);
    }
  });
});

describe('NEXT_ACTION_LABELS', () => {
  it('has labels for pickup, delivery, and return', () => {
    expect(NEXT_ACTION_LABELS).toHaveProperty('pickup');
    expect(NEXT_ACTION_LABELS).toHaveProperty('delivery');
    expect(NEXT_ACTION_LABELS).toHaveProperty('return');
  });

  it('all values are non-empty strings', () => {
    for (const label of Object.values(NEXT_ACTION_LABELS)) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('BASE_MIN_KM_PRICE / BASE_MAX_KM_PRICE', () => {
  it('are positive numbers', () => {
    expect(BASE_MIN_KM_PRICE).toBeGreaterThan(0);
    expect(BASE_MAX_KM_PRICE).toBeGreaterThan(0);
  });

  it('min is less than max', () => {
    expect(BASE_MIN_KM_PRICE).toBeLessThan(BASE_MAX_KM_PRICE);
  });

  it('define the 5–12 €/km range', () => {
    expect(BASE_MIN_KM_PRICE).toBe(5.0);
    expect(BASE_MAX_KM_PRICE).toBe(12.0);
  });
});

describe('CARGO_TYPE_KM_FACTORS', () => {
  it('has entries for all standard cargo types', () => {
    const expected = ['general', 'food', 'building', 'liquid', 'cooling', 'auto', 'heavy', 'medical', 'fuel', 'hazmat'];
    for (const type of expected) {
      expect(CARGO_TYPE_KM_FACTORS).toHaveProperty(type);
      expect(typeof CARGO_TYPE_KM_FACTORS[type]).toBe('number');
      expect(CARGO_TYPE_KM_FACTORS[type]).toBeGreaterThan(0);
    }
  });

  it('general type has factor 1.0 (base)', () => {
    expect(CARGO_TYPE_KM_FACTORS.general).toBe(1.0);
  });

  it('cooling type has factor 1.3 (as specified)', () => {
    expect(CARGO_TYPE_KM_FACTORS.cooling).toBe(1.3);
  });

  it('hazmat and fuel factors are higher than cooling (ADR premium)', () => {
    expect(CARGO_TYPE_KM_FACTORS.hazmat).toBeGreaterThan(CARGO_TYPE_KM_FACTORS.cooling);
    expect(CARGO_TYPE_KM_FACTORS.fuel).toBeGreaterThan(CARGO_TYPE_KM_FACTORS.cooling);
  });

  it('all factors are >= 1.0 (never cheaper than standard)', () => {
    for (const factor of Object.values(CARGO_TYPE_KM_FACTORS)) {
      expect(factor).toBeGreaterThanOrEqual(1.0);
    }
  });
});
