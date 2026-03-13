import { DATA } from '../data.js';
import { GS } from '../state.js';
import { uid } from '../utils.js';
import { cityById } from '../state.js';
import { buildRouteStops, routeDistance } from '../routing.js';

export function createVehicle(catalogId, homeCityId, trailerId = null) {
  const cat = DATA.VEHICLES.find(v => v.id === catalogId);
  if (!cat) return null;
  const num = GS.vehicles.filter(v => v.catalogId === catalogId).length + 1;
  const homeCityIdResolved = homeCityId || 'frankfurt';
  const homeCity = cityById[homeCityIdResolved];
  return {
    id: uid(),
    catalogId,
    name: `${cat.name} #${num}`,
    health: 100,
    fuel: cat.fuelCapacity,
    odometer: 0,
    driverId: null,
    status: 'idle',
    homeCity: homeCityIdResolved,
    currentCity: homeCityIdResolved,
    trailerId: trailerId || null,
    route: {
      stops: [],
      currentStopIndex: 0,
      progressPct: 0,
      totalDistance: 0,
      coveredDistance: 0,
    },
    position: homeCity ? { x: homeCity.x, y: homeCity.y } : { x: 0, y: 0 },
    refuelPauseMinutes: 0,
    orderQueue: [],
  };
}

/**
 * Returns the combined set of requirements for a vehicle, including
 * any requirements added by an attached trailer.
 */
export function getVehicleEffectiveRequirements(vehicle) {
  const cat = DATA.VEHICLES.find(c => c.id === vehicle.catalogId);
  if (!cat) return [];
  const reqs = [...cat.requirements];
  if (vehicle.trailerId) {
    const trailer = DATA.TRAILERS.find(t => t.id === vehicle.trailerId);
    if (trailer) {
      for (const r of trailer.requirements) {
        if (!reqs.includes(r)) reqs.push(r);
      }
    }
  }
  return reqs;
}

/**
 * Returns the effective cargo capacity of a vehicle, including any
 * capacity bonus granted by an attached trailer.
 */
export function getVehicleEffectiveCapacity(vehicle) {
  const cat = DATA.VEHICLES.find(c => c.id === vehicle.catalogId);
  if (!cat) return 0;
  let capacity = cat.capacity;
  if (vehicle.trailerId) {
    const trailer = DATA.TRAILERS.find(t => t.id === vehicle.trailerId);
    if (trailer) capacity += trailer.capacityBonus;
  }
  return capacity;
}

export function updatePositionForVehicle(v) {
  const stops = v.route.stops;
  if (!stops || stops.length === 0) {
    const c = cityById[v.currentCity];
    if (c) { v.position.x = c.x; v.position.y = c.y; }
    return;
  }
  const idx = v.route.currentStopIndex;
  if (idx >= stops.length - 1) {
    const c = cityById[stops[stops.length - 1].cityId];
    if (c) { v.position.x = c.x; v.position.y = c.y; }
    return;
  }
  const from = cityById[stops[idx].cityId];
  const to   = cityById[stops[idx + 1].cityId];
  if (!from || !to) return;
  const pct = v.route.progressPct / 100;
  v.position.x = from.x + (to.x - from.x) * pct;
  v.position.y = from.y + (to.y - from.y) * pct;
}

export function startOrderForVehicle(vehicle, order) {
  vehicle.status = 'driving';
  const keyWaypoints = [
    { cityId: vehicle.currentCity, action: 'depart' },
    { cityId: order.origin,        action: 'pickup',   orderId: order.id },
    { cityId: order.destination,   action: 'delivery', orderId: order.id },
    { cityId: vehicle.homeCity,    action: 'return' },
  ];
  const expandedStops = buildRouteStops(keyWaypoints)
    .filter((s, i, arr) => i === 0 || s.cityId !== arr[i - 1].cityId);

  vehicle.route = {
    stops: expandedStops,
    currentStopIndex: 0,
    progressPct: 0,
    totalDistance: routeDistance(expandedStops),
    coveredDistance: 0,
  };

  updatePositionForVehicle(vehicle);
}
