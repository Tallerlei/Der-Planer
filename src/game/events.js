import { DATA } from '../data.js';
import { GS } from '../state.js';
import { showToast } from '../ui/notifications.js';

export function checkMarketEvents() {
  const diff = DATA.DIFFICULTY[GS.company.difficulty];
  for (const evt of DATA.MARKET_EVENTS) {
    if (Math.random() < evt.probability * diff.eventProbabilityMod / 30) {
      applyEvent(evt);
    }
  }
  GS.market.activeEvents = GS.market.activeEvents.filter(e => {
    e.remainingDays--;
    if (e.remainingDays <= 0) {
      revertEvent(e);
      return false;
    }
    return true;
  });
}

export function applyEvent(evt) {
  if (GS.market.activeEvents.some(e => e.id === evt.id)) return;
  const active = { id: evt.id, title: evt.title, remainingDays: evt.effect.duration };
  GS.market.activeEvents.push(active);

  if (evt.effect.fuelPriceMod)   GS.market.fuelPrice      += evt.effect.fuelPriceMod;
  if (evt.effect.orderValueMod)  GS.market.orderValueMod  += evt.effect.orderValueMod;
  if (evt.effect.orderVolumeMod) GS.market.orderVolumeMod += evt.effect.orderVolumeMod;
  if (evt.effect.speedMod)       GS.market.speedMod        = Math.max(0.3, GS.market.speedMod + evt.effect.speedMod);
  GS.market.fuelPrice = Math.max(0.80, GS.market.fuelPrice);

  showToast(`📰 ${evt.title}: ${evt.description}`, 'warning');
}

export function revertEvent(active) {
  const evt = DATA.MARKET_EVENTS.find(e => e.id === active.id);
  if (!evt) return;
  if (evt.effect.fuelPriceMod)   GS.market.fuelPrice      -= evt.effect.fuelPriceMod;
  if (evt.effect.orderValueMod)  GS.market.orderValueMod  -= evt.effect.orderValueMod;
  if (evt.effect.orderVolumeMod) GS.market.orderVolumeMod -= evt.effect.orderVolumeMod;
  if (evt.effect.speedMod)       GS.market.speedMod        = Math.min(1, GS.market.speedMod - evt.effect.speedMod);
  GS.market.fuelPrice = Math.max(0.80, GS.market.fuelPrice);
}
