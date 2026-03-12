import { describe, it, expect, beforeEach } from 'vitest';
import { getReputationTier, canFulfillOrder, getFleetCapabilities } from '../game/orders.js';
import { GS } from '../state.js';

describe('getReputationTier', () => {
  it('returns tier 1 for rep 0-20', () => {
    expect(getReputationTier(0)).toBe(1);
    expect(getReputationTier(20)).toBe(1);
  });

  it('returns tier 2 for rep 21-40', () => {
    expect(getReputationTier(21)).toBe(2);
    expect(getReputationTier(40)).toBe(2);
  });

  it('returns tier 3 for rep 41-60', () => {
    expect(getReputationTier(41)).toBe(3);
    expect(getReputationTier(60)).toBe(3);
  });

  it('returns tier 4 for rep 61-80', () => {
    expect(getReputationTier(61)).toBe(4);
    expect(getReputationTier(80)).toBe(4);
  });

  it('returns tier 5 for rep 81-100', () => {
    expect(getReputationTier(81)).toBe(5);
    expect(getReputationTier(100)).toBe(5);
  });
});

describe('canFulfillOrder', () => {
  beforeEach(() => {
    GS.vehicles = [];
  });

  it('returns not feasible when no vehicles', () => {
    const order = { requirements: [] };
    const result = canFulfillOrder(order);
    expect(result.feasible).toBe(false);
  });

  it('returns feasible when vehicle with driver meets requirements', () => {
    GS.vehicles = [{
      id: 'v1',
      catalogId: 'transit',
      status: 'idle',
      driverId: 'd1',
    }];
    const order = { requirements: [] };
    const result = canFulfillOrder(order);
    expect(result.feasible).toBe(true);
  });

  it('returns not feasible when requirements not met', () => {
    GS.vehicles = [{
      id: 'v1',
      catalogId: 'transit',
      status: 'idle',
      driverId: 'd1',
    }];
    const order = { requirements: ['cooling'] };
    const result = canFulfillOrder(order);
    expect(result.feasible).toBe(false);
  });

  it('returns not feasible when vehicle has no driver', () => {
    GS.vehicles = [{
      id: 'v1',
      catalogId: 'transit',
      status: 'idle',
      driverId: null,
    }];
    const order = { requirements: [] };
    const result = canFulfillOrder(order);
    expect(result.feasible).toBe(false);
  });
});

describe('getFleetCapabilities', () => {
  beforeEach(() => {
    GS.vehicles = [];
  });

  it('returns zero capacity and empty reqs when fleet is empty', () => {
    const { maxCapacity, metReqs } = getFleetCapabilities();
    expect(maxCapacity).toBe(0);
    expect(metReqs.size).toBe(0);
  });

  it('returns max capacity of non-broken vehicles', () => {
    GS.vehicles = [
      { id: 'v1', catalogId: 'transit',      status: 'idle',   driverId: 'd1' },
      { id: 'v2', catalogId: 'truck_small',  status: 'idle',   driverId: 'd2' },
      { id: 'v3', catalogId: 'truck_medium', status: 'broken', driverId: 'd3' },
    ];
    const { maxCapacity } = getFleetCapabilities();
    // transit=2000, truck_small=7500, truck_medium=18000 (broken, excluded)
    expect(maxCapacity).toBe(7500);
  });

  it('collects special requirements from all non-broken vehicles', () => {
    GS.vehicles = [
      { id: 'v1', catalogId: 'reefer',  status: 'idle', driverId: 'd1' },
      { id: 'v2', catalogId: 'tanker',  status: 'idle', driverId: 'd2' },
    ];
    // reefer has ['cooling'], tanker has ['adr']
    const { metReqs } = getFleetCapabilities();
    expect(metReqs.has('cooling')).toBe(true);
    expect(metReqs.has('adr')).toBe(true);
    expect(metReqs.has('heavy_load')).toBe(false);
  });

  it('ignores broken vehicles when computing capabilities', () => {
    GS.vehicles = [
      { id: 'v1', catalogId: 'transit', status: 'broken', driverId: 'd1' },
    ];
    const { maxCapacity } = getFleetCapabilities();
    expect(maxCapacity).toBe(0);
  });
});
