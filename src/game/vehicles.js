import { DATA } from '../data.js';
import { GS } from '../state.js';
import { uid } from '../utils.js';
import { cityById } from '../state.js';
import { buildRouteStops, routeDistance } from '../routing.js';
import { getStaffRoleStrength } from './staff.js';

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
    stopMinutes: 0,
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
    if (c) v.position = { x: c.x, y: c.y };
    return;
  }
  const idx = v.route.currentStopIndex;
  if (idx >= stops.length - 1) {
    const c = cityById[stops[stops.length - 1].cityId];
    if (c) v.position = { x: c.x, y: c.y };
    return;
  }
  const from = cityById[stops[idx].cityId];
  const to   = cityById[stops[idx + 1].cityId];
  if (!from || !to) return;
  const pct = v.route.progressPct / 100;
  v.position = {
    x: from.x + (to.x - from.x) * pct,
    y: from.y + (to.y - from.y) * pct,
  };
}

/**
 * Returns true when a vehicle is driving back to its home base after completing
 * all pickups and deliveries (i.e. no more 'pickup' or 'delivery' stops remain
 * in the current route ahead of the vehicle's current position).
 */
export function isVehicleReturningToBase(vehicle) {
  if (vehicle.status !== 'driving') return false;
  const stops = vehicle.route && vehicle.route.stops;
  if (!stops || stops.length === 0) return false;
  const ahead = stops.slice(vehicle.route.currentStopIndex + 1);
  return !ahead.some(s => s.action === 'pickup' || s.action === 'delivery');
}

export function startOrderForVehicle(vehicle, order) {
  vehicle.status = 'driving';
  const keyWaypoints = [
    { cityId: vehicle.currentCity, action: 'depart' },
    { cityId: order.origin,        action: 'pickup',   orderId: order.id },
    { cityId: order.destination,   action: 'delivery', orderId: order.id },
    { cityId: vehicle.homeCity,    action: 'return' },
  ];
  const expandedStops = buildRouteStops(keyWaypoints);

  vehicle.route = {
    stops: expandedStops,
    currentStopIndex: 0,
    progressPct: 0,
    totalDistance: routeDistance(expandedStops),
    coveredDistance: 0,
  };

  updatePositionForVehicle(vehicle);
}

export function startTourForVehicle(vehicle, orders, returnToBase = false) {
  if (!vehicle || !Array.isArray(orders) || orders.length === 0) return false;

  const keyWaypoints = [{ cityId: vehicle.currentCity, action: 'depart' }];
  for (const order of orders) {
    keyWaypoints.push(
      { cityId: order.origin, action: 'pickup', orderId: order.id },
      { cityId: order.destination, action: 'delivery', orderId: order.id },
    );
  }
  if (returnToBase) keyWaypoints.push({ cityId: vehicle.homeCity, action: 'return' });

  const expandedStops = buildRouteStops(keyWaypoints);
  const tourId = uid();
  vehicle.status = 'driving';
  vehicle.plannedTour = {
    id: tourId,
    orderIds: orders.map(order => order.id),
    returnToBase,
    endCity: keyWaypoints[keyWaypoints.length - 1].cityId,
  };
  vehicle.route = {
    stops: expandedStops,
    currentStopIndex: 0,
    progressPct: 0,
    totalDistance: routeDistance(expandedStops),
    coveredDistance: 0,
    tourId,
  };
  updatePositionForVehicle(vehicle);
  return true;
}

export function getVehicleConditionFactor(vehicle) {
  const health = Math.max(0, Math.min(100, vehicle.health ?? 100));
  return 0.65 + health / 100 * 0.35;
}

export function getVehicleFuelConditionFactor(vehicle) {
  const health = Math.max(0, Math.min(100, vehicle.health ?? 100));
  return 1 + (100 - health) / 100 * 0.35;
}

export function getVehicleWearPerKm(vehicle) {
  const mechanic = getStaffRoleStrength('mechanic');
  return 0.002 * (1 - Math.min(0.35, mechanic * 0.07));
}
