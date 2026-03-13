import { GS } from '../state.js';
import { updatePositionForVehicle } from './vehicles.js';

const SAVE_KEY = 'derplaner_save';

export function autoSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(GS)); } catch(e) {}
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    Object.assign(GS, saved);
    if (!Array.isArray(GS.messageLog)) GS.messageLog = [];
    if (!Array.isArray(GS.trailers))   GS.trailers   = [];
    if (!GS.ui.orderSort) GS.ui.orderSort = { field: 'value', dir: 'desc' };
    GS.vehicles.forEach(v => {
      if (v.refuelPauseMinutes === undefined) v.refuelPauseMinutes = 0;
      if (v.orderQueue === undefined) v.orderQueue = [];
      if (v.trailerId === undefined) v.trailerId = null;
      updatePositionForVehicle(v);
    });
    [...GS.orders.available, ...GS.orders.active].forEach(o => {
      if (o.remainingWeight === undefined) o.remainingWeight = o.weight;
      if (o.tripsCompleted  === undefined) o.tripsCompleted  = 0;
    });
    // Remove orders whose acceptance deadline has already passed (silently, without rep penalty)
    const now = GS.time.totalMinutes;
    GS.orders.available = GS.orders.available.filter(o => {
      if ((now - o.receivedMinute) > o.expiresInDays * 1440) {
        o.status = 'expired';
        GS.orders.declined.unshift(o);
        return false;
      }
      return true;
    });
    return true;
  } catch (e) { return false; }
}

export function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
export function deleteSave() { localStorage.removeItem(SAVE_KEY); }
