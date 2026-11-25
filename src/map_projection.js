/**
 * Map projection for the Europe map: spherical Lambert azimuthal equal-area
 * (the projection behind the official EU map grid, ETRS89-LAEA), centred on
 * Central Europe and fitted into the 800 × 520 map coordinate space.
 *
 * Shared by the game UI and scripts/build-map-geo.mjs, so pre-generated
 * geometry and live positions always line up.
 */
const DEG = Math.PI / 180;
const LON0 = 10 * DEG;
const LAT0 = 52 * DEG;

export const MAP_WIDTH = 800;
export const MAP_HEIGHT = 520;

function laea(lon, lat) {
  const lambda = lon * DEG - LON0;
  const phi = lat * DEG;
  const k = Math.sqrt(2 / (1 + Math.sin(LAT0) * Math.sin(phi) + Math.cos(LAT0) * Math.cos(phi) * Math.cos(lambda)));
  return [
    k * Math.cos(phi) * Math.sin(lambda),
    k * (Math.cos(LAT0) * Math.sin(phi) - Math.sin(LAT0) * Math.cos(phi) * Math.cos(lambda)),
  ];
}

// Geographic frame that must be visible: Lisbon to Helsinki, Oslo to Athens, plus sea margins.
const FRAME = [[-11.5, 37], [-9, 56], [27, 61.6], [29, 37], [13, 35.2], [10, 61.8]];
const _projected = FRAME.map(([lon, lat]) => laea(lon, lat));
const _minX = Math.min(..._projected.map(p => p[0]));
const _maxX = Math.max(..._projected.map(p => p[0]));
const _minY = Math.min(..._projected.map(p => p[1]));
const _maxY = Math.max(..._projected.map(p => p[1]));
const SCALE = Math.min(MAP_WIDTH / (_maxX - _minX), MAP_HEIGHT / (_maxY - _minY));
const OFFSET_X = (MAP_WIDTH - (_maxX - _minX) * SCALE) / 2;
const OFFSET_Y = (MAP_HEIGHT - (_maxY - _minY) * SCALE) / 2;

/** Projects longitude/latitude (degrees) into map coordinates (y grows downwards). */
export function projectLonLat(lon, lat) {
  const [x, y] = laea(lon, lat);
  return {
    x: OFFSET_X + (x - _minX) * SCALE,
    y: OFFSET_Y + (_maxY - y) * SCALE,
  };
}
