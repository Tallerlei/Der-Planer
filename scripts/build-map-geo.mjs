/**
 * Generates src/map_geo_data.js from Natural Earth GeoJSON (public domain,
 * https://www.naturalearthdata.com/). Geometry is projected with the game's
 * map projection, clipped to the map frame, simplified and rounded so the
 * game can render a realistic offline map without any tile service.
 *
 * Usage: node scripts/build-map-geo.mjs <directory with Natural Earth .geojson files>
 * Required files: ne_50m_admin_0_countries, ne_50m_land, ne_50m_admin_0_boundary_lines_land,
 * ne_50m_lakes, ne_10m_rivers_lake_centerlines, ne_50m_geography_regions_polys
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectLonLat, MAP_WIDTH, MAP_HEIGHT } from '../src/map_projection.js';

const SOURCE_DIR = process.argv[2];
if (!SOURCE_DIR) {
  console.error('Usage: node scripts/build-map-geo.mjs <natural-earth-geojson-dir>');
  process.exit(1);
}

const PAD = 20;
const BOX = { minX: -PAD, minY: -PAD, maxX: MAP_WIDTH + PAD, maxY: MAP_HEIGHT + PAD };
const TOLERANCE = 0.22;

const load = name => JSON.parse(readFileSync(join(SOURCE_DIR, `${name}.geojson`), 'utf8'));
const round = value => Math.round(value * 10) / 10;

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function linesOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

const project = ring => ring.map(([lon, lat]) => {
  const point = projectLonLat(lon, lat);
  return [point.x, point.y];
});

function intersectX(a, b, x) {
  const t = (x - a[0]) / (b[0] - a[0]);
  return [x, a[1] + t * (b[1] - a[1])];
}

function intersectY(a, b, y) {
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), y];
}

// Sutherland–Hodgman polygon clipping against the padded map box.
function clipPolygon(points) {
  const edges = [
    [p => p[0] >= BOX.minX, (a, b) => intersectX(a, b, BOX.minX)],
    [p => p[0] <= BOX.maxX, (a, b) => intersectX(a, b, BOX.maxX)],
    [p => p[1] >= BOX.minY, (a, b) => intersectY(a, b, BOX.minY)],
    [p => p[1] <= BOX.maxY, (a, b) => intersectY(a, b, BOX.maxY)],
  ];
  let output = points;
  for (const [inside, intersect] of edges) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      if (inside(current)) {
        if (!inside(previous)) output.push(intersect(previous, current));
        output.push(current);
      } else if (inside(previous)) {
        output.push(intersect(previous, current));
      }
    }
    if (output.length === 0) break;
  }
  return output;
}

const insideBox = p => p[0] >= BOX.minX && p[0] <= BOX.maxX && p[1] >= BOX.minY && p[1] <= BOX.maxY;

/** Splits a polyline into the runs that lie inside the map box. */
function clipLine(points) {
  const runs = [];
  let run = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const neighbourInside = (i > 0 && insideBox(points[i - 1])) || (i < points.length - 1 && insideBox(points[i + 1]));
    if (insideBox(point) || neighbourInside) {
      run.push(point);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs.filter(item => item.length >= 2);
}

// Douglas–Peucker simplification in map units.
function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const squared = tolerance * tolerance;
  while (stack.length) {
    const [start, end] = stack.pop();
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = points[i];
      const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const distance = ex * ex + ey * ey;
      if (distance > maxDistance) { maxDistance = distance; index = i; }
    }
    if (maxDistance > squared && index > 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function area(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

const flat = points => points.flatMap(([x, y]) => [round(x), round(y)]);

function processPolygons(geometry, minArea = 0.6) {
  const rings = [];
  for (const polygon of polygonsOf(geometry)) {
    for (const ring of polygon) {
      const clipped = clipPolygon(project(ring));
      if (clipped.length < 3) continue;
      const simplified = simplify(clipped, TOLERANCE);
      if (simplified.length < 3 || area(simplified) < minArea) continue;
      rings.push(flat(simplified));
    }
  }
  return rings;
}

function processLines(geometry, tolerance = TOLERANCE) {
  const lines = [];
  for (const line of linesOf(geometry)) {
    for (const run of clipLine(project(line))) {
      const simplified = simplify(run, tolerance);
      if (simplified.length >= 2) lines.push(flat(simplified));
    }
  }
  return lines;
}

// ── Countries ────────────────────────────────────────────────
const countries = [];
for (const feature of load('ne_50m_admin_0_countries').features) {
  const props = feature.properties;
  const rings = processPolygons(feature.geometry);
  if (rings.length === 0) continue;
  const label = projectLonLat(props.LABEL_X, props.LABEL_Y);
  countries.push({
    iso: props.ISO_A2_EH,
    name: props.NAME_DE,
    rank: props.LABELRANK,
    label: insideBox([label.x, label.y]) ? [round(label.x), round(label.y)] : null,
    rings,
  });
}

// ── Coastlines, borders, lakes, rivers, mountain ranges ─────
const coast = load('ne_50m_land').features.flatMap(feature => processPolygons(feature.geometry));
const borders = load('ne_50m_admin_0_boundary_lines_land').features.flatMap(feature => processLines(feature.geometry));
const lakes = load('ne_50m_lakes').features.flatMap(feature => processPolygons(feature.geometry, 1.5));

const rivers = [];
for (const feature of load('ne_10m_rivers_lake_centerlines').features) {
  const rank = feature.properties.scalerank;
  if (rank > 8 || feature.properties.featurecla !== 'River') continue;
  for (const line of processLines(feature.geometry, 0.3)) rivers.push({ rank, line });
}

const mountains = [];
for (const feature of load('ne_50m_geography_regions_polys').features) {
  const props = feature.properties;
  if (props.FEATURECLA !== 'Range/mtn') continue;
  const rings = processPolygons(feature.geometry, 4);
  if (rings.length === 0) continue;
  mountains.push({ name: props.NAME_DE || props.NAME, rings });
}

const data = { countries, coast, borders, lakes, rivers, mountains };
const header = `// Generated by scripts/build-map-geo.mjs from Natural Earth data (public domain).
// Coordinates are pre-projected into the 800 × 520 map space. Do not edit by hand.
`;
writeFileSync(new URL('../src/map_geo_data.js', import.meta.url), `${header}export const MAP_GEO = ${JSON.stringify(data)};\n`);

const points = JSON.stringify(data).match(/-?\d+\.?\d*/g).length / 2;
console.log(`countries ${countries.length}, coast ${coast.length}, borders ${borders.length}, lakes ${lakes.length}, rivers ${rivers.length}, mountains ${mountains.length}, ~${Math.round(points)} points`);
