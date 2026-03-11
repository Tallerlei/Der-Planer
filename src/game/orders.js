import { DATA } from '../data.js';
import { GS } from '../state.js';
import { REP_TIER_MAX_WEIGHT, REQ_LABELS } from '../constants.js';

export function getReputationTier(rep) {
  if (rep <= 20) return 1;
  if (rep <= 40) return 2;
  if (rep <= 60) return 3;
  if (rep <= 80) return 4;
  return 5;
}

/**
 * Returns the fleet's maximum vehicle capacity and the set of special
 * requirements that can be met by at least one non-broken vehicle.
 * Used by generateOrders() to guarantee single-trip feasible orders.
 */
export function getFleetCapabilities() {
  const fleetVehicles = GS.vehicles.filter(v => v.status !== 'broken');
  let maxCapacity = 0;
  const metReqs = new Set();
  for (const v of fleetVehicles) {
    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    if (!cat) continue;
    if (cat.capacity > maxCapacity) maxCapacity = cat.capacity;
    for (const r of cat.requirements) metReqs.add(r);
  }
  return { maxCapacity, metReqs };
}

export function canFulfillOrder(order) {
  const assignableVehicles = GS.vehicles.filter(v =>
    (v.status === 'idle' || v.status === 'driving') && v.driverId
  );
  if (assignableVehicles.length === 0) {
    return { feasible: false, reason: 'Kein Fahrzeug mit Fahrer verfügbar' };
  }
  for (const v of assignableVehicles) {
    const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
    if (!cat) continue;
    const meetsReqs = order.requirements.every(req => cat.requirements.includes(req));
    if (meetsReqs) return { feasible: true, reason: '' };
  }
  const reqLabel = order.requirements.map(r => REQ_LABELS[r] || r).join(', ');
  return {
    feasible: false,
    reason: order.requirements.length
      ? `Kein Fahrzeug mit ${reqLabel}`
      : 'Kein geeignetes Fahrzeug verfügbar',
  };
}
