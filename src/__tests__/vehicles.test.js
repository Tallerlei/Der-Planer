import { describe, it, expect } from 'vitest';
import { getVehicleEffectiveRequirements, getVehicleEffectiveCapacity } from '../game/vehicles.js';

describe('getVehicleEffectiveRequirements', () => {
  it('returns base requirements when no trailer attached', () => {
    const vehicle = { catalogId: 'transit', trailerId: null };
    expect(getVehicleEffectiveRequirements(vehicle)).toEqual([]);
  });

  it('returns base requirements for a vehicle with built-in requirements and no trailer', () => {
    const vehicle = { catalogId: 'reefer', trailerId: null };
    expect(getVehicleEffectiveRequirements(vehicle)).toEqual(['cooling']);
  });

  it('merges trailer requirements into vehicle requirements', () => {
    const vehicle = { catalogId: 'semi', trailerId: 'reefer_trailer' };
    const reqs = getVehicleEffectiveRequirements(vehicle);
    expect(reqs).toContain('cooling');
  });

  it('does not duplicate requirements already present on vehicle', () => {
    // tanker already has 'adr', tank_trailer also has 'adr'
    const vehicle = { catalogId: 'tanker', trailerId: 'tank_trailer' };
    const reqs = getVehicleEffectiveRequirements(vehicle);
    expect(reqs.filter(r => r === 'adr').length).toBe(1);
  });

  it('returns empty array for unknown catalogId', () => {
    const vehicle = { catalogId: 'nonexistent', trailerId: null };
    expect(getVehicleEffectiveRequirements(vehicle)).toEqual([]);
  });

  it('ignores unknown trailerId and returns only base requirements', () => {
    const vehicle = { catalogId: 'semi', trailerId: 'nonexistent_trailer' };
    expect(getVehicleEffectiveRequirements(vehicle)).toEqual([]);
  });

  it('no-requirement trailer does not add requirements to vehicle', () => {
    const vehicle = { catalogId: 'semi', trailerId: 'curtainsider' };
    expect(getVehicleEffectiveRequirements(vehicle)).toEqual([]);
  });
});

describe('getVehicleEffectiveCapacity', () => {
  it('returns base capacity when no trailer attached', () => {
    const vehicle = { catalogId: 'transit', trailerId: null };
    expect(getVehicleEffectiveCapacity(vehicle)).toBe(2000);
  });

  it('adds trailer capacity bonus', () => {
    // semi base capacity 24000 + curtainsider bonus 2000 = 26000
    const vehicle = { catalogId: 'semi', trailerId: 'curtainsider' };
    expect(getVehicleEffectiveCapacity(vehicle)).toBe(26000);
  });

  it('adds zero capacity bonus for reefer_trailer', () => {
    // semi base capacity 24000 + reefer_trailer bonus 0 = 24000
    const vehicle = { catalogId: 'semi', trailerId: 'reefer_trailer' };
    expect(getVehicleEffectiveCapacity(vehicle)).toBe(24000);
  });

  it('adds tank_trailer capacity bonus', () => {
    // semi base capacity 24000 + tank_trailer bonus 4000 = 28000
    const vehicle = { catalogId: 'semi', trailerId: 'tank_trailer' };
    expect(getVehicleEffectiveCapacity(vehicle)).toBe(28000);
  });

  it('returns 0 for unknown catalogId', () => {
    const vehicle = { catalogId: 'nonexistent', trailerId: null };
    expect(getVehicleEffectiveCapacity(vehicle)).toBe(0);
  });

  it('ignores unknown trailerId and returns base capacity only', () => {
    const vehicle = { catalogId: 'semi', trailerId: 'nonexistent_trailer' };
    expect(getVehicleEffectiveCapacity(vehicle)).toBe(24000);
  });
});
