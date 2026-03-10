import { describe, it, expect } from 'vitest';
import { getDistance, findShortestPath, buildRouteStops, routeDistance } from '../routing.js';

describe('getDistance', () => {
  it('returns 0 for same city', () => {
    expect(getDistance('berlin', 'berlin')).toBe(0);
  });

  it('returns direct distance for connected cities', () => {
    expect(getDistance('hamburg', 'berlin')).toBe(286);
    expect(getDistance('berlin', 'hamburg')).toBe(286);
  });

  it('returns positive number for unknown city pair', () => {
    expect(getDistance('frankfurt', 'paris')).toBeGreaterThan(0);
  });
});

describe('findShortestPath', () => {
  it('returns single element for same city', () => {
    expect(findShortestPath('berlin', 'berlin')).toEqual(['berlin']);
  });

  it('finds path between directly connected cities', () => {
    const path = findShortestPath('hamburg', 'berlin');
    expect(path[0]).toBe('hamburg');
    expect(path[path.length - 1]).toBe('berlin');
    expect(path.length).toBeGreaterThan(0);
  });

  it('finds path between indirectly connected cities', () => {
    const path = findShortestPath('hamburg', 'muenchen');
    expect(path[0]).toBe('hamburg');
    expect(path[path.length - 1]).toBe('muenchen');
    expect(path.length).toBeGreaterThan(2);
  });

  it('returns a non-empty array for unknown city ids', () => {
    const path = findShortestPath('fakecity1', 'fakecity2');
    expect(Array.isArray(path)).toBe(true);
    expect(path.length).toBeGreaterThanOrEqual(1);
  });
});

describe('routeDistance', () => {
  it('returns 0 for empty stops', () => {
    expect(routeDistance([])).toBe(0);
  });

  it('returns 0 for single stop', () => {
    expect(routeDistance([{ cityId: 'berlin' }])).toBe(0);
  });

  it('sums distances for multiple stops', () => {
    const stops = [{ cityId: 'hamburg' }, { cityId: 'berlin' }, { cityId: 'dresden' }];
    const dist = routeDistance(stops);
    expect(dist).toBe(getDistance('hamburg', 'berlin') + getDistance('berlin', 'dresden'));
  });
});

describe('buildRouteStops', () => {
  it('returns empty array for empty input', () => {
    expect(buildRouteStops([])).toEqual([]);
  });

  it('returns single waypoint for single input', () => {
    const wp = [{ cityId: 'berlin', action: 'depart' }];
    expect(buildRouteStops(wp)).toEqual(wp);
  });

  it('includes intermediate transit stops', () => {
    const waypoints = [
      { cityId: 'hamburg', action: 'depart' },
      { cityId: 'muenchen', action: 'delivery' },
    ];
    const stops = buildRouteStops(waypoints);
    expect(stops[0].cityId).toBe('hamburg');
    expect(stops[stops.length - 1].cityId).toBe('muenchen');
    expect(stops.length).toBeGreaterThan(2);
  });
});
