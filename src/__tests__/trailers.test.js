import { describe, it, expect } from 'vitest';
import { DATA } from '../data.js';

describe('DATA.TRAILERS structure', () => {
  it('all trailers have required fields', () => {
    for (const t of DATA.TRAILERS) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('icon');
      expect(t).toHaveProperty('compatibleWith');
      expect(Array.isArray(t.compatibleWith)).toBe(true);
      expect(t.compatibleWith.length).toBeGreaterThan(0);
      expect(t).toHaveProperty('requirements');
      expect(Array.isArray(t.requirements)).toBe(true);
      expect(t).toHaveProperty('capacityBonus');
      expect(typeof t.capacityBonus).toBe('number');
      expect(t).toHaveProperty('purchasePrice');
      expect(t.purchasePrice).toBeGreaterThan(0);
      expect(t).toHaveProperty('description');
    }
  });

  it('all compatible vehicle ids exist in DATA.VEHICLES', () => {
    const vehicleIds = DATA.VEHICLES.map(v => v.id);
    for (const t of DATA.TRAILERS) {
      for (const vid of t.compatibleWith) {
        expect(vehicleIds).toContain(vid);
      }
    }
  });

  it('compatible vehicles have trailerSlot set to true', () => {
    for (const t of DATA.TRAILERS) {
      for (const vid of t.compatibleWith) {
        const vcat = DATA.VEHICLES.find(v => v.id === vid);
        expect(vcat).toBeDefined();
        expect(vcat.trailerSlot).toBe(true);
      }
    }
  });

  it('trailer ids are unique', () => {
    const ids = DATA.TRAILERS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('capacityBonus is non-negative', () => {
    for (const t of DATA.TRAILERS) {
      expect(t.capacityBonus).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('trailer compatibility', () => {
  it('semi is compatible with multiple trailer types', () => {
    const semiTrailers = DATA.TRAILERS.filter(t => t.compatibleWith.includes('semi'));
    expect(semiTrailers.length).toBeGreaterThan(1);
  });

  it('reefer_trailer is compatible with reefer vehicle', () => {
    const t = DATA.TRAILERS.find(t => t.id === 'reefer_trailer');
    expect(t).toBeDefined();
    expect(t.compatibleWith).toContain('reefer');
  });

  it('tank_trailer is compatible with tanker vehicle', () => {
    const t = DATA.TRAILERS.find(t => t.id === 'tank_trailer');
    expect(t).toBeDefined();
    expect(t.compatibleWith).toContain('tanker');
  });

  it('van trailers are only compatible with transit', () => {
    const vanTrailers = DATA.TRAILERS.filter(t => t.id.startsWith('van_'));
    for (const t of vanTrailers) {
      expect(t.compatibleWith).toEqual(['transit']);
    }
  });
});

describe('GS.trailers initial state', () => {
  it('GS has a trailers array in default state', async () => {
    const { GS } = await import('../state.js');
    expect(Array.isArray(GS.trailers)).toBe(true);
    expect(GS.trailers.length).toBe(0);
  });
});
