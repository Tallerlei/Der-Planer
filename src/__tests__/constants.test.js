import { describe, it, expect } from 'vitest';
import {
  APP_VERSION, TIME_COSTS, REFUEL_THRESHOLD, REFUEL_DURATION_MINUTES,
  RENDER_THROTTLE_MS, TOAST_DISPLAY_MS, ORDER_POOL_MULTIPLIER, MINUTES_PER_TICK,
  REP_TIER_MAX_WEIGHT, REQ_LABELS,
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
      'assignDriver', 'takeLoan', 'refreshCand'];
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
