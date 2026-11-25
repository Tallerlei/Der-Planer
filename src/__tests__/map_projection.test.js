import { describe, expect, it } from 'vitest';
import { DATA } from '../data.js';
import { MAP_HEIGHT, MAP_WIDTH, projectLonLat } from '../map_projection.js';

const pos = id => {
  const city = DATA.CITIES.find(item => item.id === id);
  return projectLonLat(city.lon, city.lat);
};

describe('map projection', () => {
  it('places every city with real coordinates inside the map frame', () => {
    for (const city of DATA.CITIES) {
      expect(Number.isFinite(city.lat) && Number.isFinite(city.lon)).toBe(true);
      const { x, y } = projectLonLat(city.lon, city.lat);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(MAP_WIDTH);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it('keeps real-world relations between cities', () => {
    expect(pos('athen').x).toBeGreaterThan(pos('rom').x);
    expect(pos('helsinki').x).toBeGreaterThan(pos('stockholm').x);
    expect(pos('oslo').y).toBeLessThan(pos('kopenhagen').y);
    expect(pos('lissabon').x).toBeLessThan(pos('madrid').x);
  });
});
