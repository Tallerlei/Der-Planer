import { DATA } from './data.js';
import { cityById } from './state.js';

const distCache = {};

export function getDistance(a, b) {
  if (a === b) return 0;
  const key = [a, b].sort().join('|');
  if (distCache[key]) return distCache[key];
  for (const [c1, c2, d] of DATA.CONNECTIONS) {
    if ((c1 === a && c2 === b) || (c1 === b && c2 === a)) {
      distCache[key] = d;
      return d;
    }
  }
  const ca = cityById[a], cb = cityById[b];
  if (!ca || !cb) return 500;
  const px = Math.sqrt(Math.pow(ca.x - cb.x, 2) + Math.pow(ca.y - cb.y, 2));
  const dist = Math.round(px * 1.4);
  distCache[key] = dist;
  return dist;
}

export function routeDistance(stops) {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    total += getDistance(stops[i-1].cityId, stops[i].cityId);
  }
  return total;
}

export function findShortestPath(fromId, toId) {
  if (fromId === toId) return [fromId];

  const adj = {};
  for (const [a, b, dist] of DATA.CONNECTIONS) {
    if (!adj[a]) adj[a] = [];
    if (!adj[b]) adj[b] = [];
    adj[a].push({ id: b, dist });
    adj[b].push({ id: a, dist });
  }

  const dist  = {};
  const prev  = {};
  const queue = [];
  for (const c of DATA.CITIES) dist[c.id] = Infinity;
  dist[fromId] = 0;
  queue.push({ id: fromId, d: 0 });

  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d);
    const { id: cur, d: curD } = queue.shift();
    if (curD > dist[cur]) continue;
    if (cur === toId) break;
    for (const { id: nb, dist: w } of (adj[cur] || [])) {
      const nd = dist[cur] + w;
      if (nd < dist[nb]) {
        dist[nb] = nd;
        prev[nb] = cur;
        queue.push({ id: nb, d: nd });
      }
    }
  }

  if (dist[toId] === Infinity) return [fromId, toId];

  const path = [];
  let cur = toId;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

export function buildRouteStops(keyWaypoints) {
  if (keyWaypoints.length === 0) return [];
  const result = [keyWaypoints[0]];
  for (let i = 1; i < keyWaypoints.length; i++) {
    const path = findShortestPath(keyWaypoints[i - 1].cityId, keyWaypoints[i].cityId);
    for (let j = 1; j < path.length - 1; j++) {
      result.push({ cityId: path[j], action: 'transit' });
    }
    result.push(keyWaypoints[i]);
  }
  return result;
}
