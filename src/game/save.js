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
    GS.vehicles.forEach(v => {
      if (v.refuelPauseMinutes === undefined) v.refuelPauseMinutes = 0;
      if (v.orderQueue === undefined) v.orderQueue = [];
      updatePositionForVehicle(v);
    });
    [...GS.orders.available, ...GS.orders.active].forEach(o => {
      if (o.remainingWeight === undefined) o.remainingWeight = o.weight;
      if (o.tripsCompleted  === undefined) o.tripsCompleted  = 0;
    });
    return true;
  } catch (e) { return false; }
}

export function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
export function deleteSave() { localStorage.removeItem(SAVE_KEY); }
