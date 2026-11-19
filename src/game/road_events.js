import { DATA } from '../data.js';
import { GS, cityById } from '../state.js';
import { fmt, rand, pick } from '../utils.js';
import { ROAD_EVENT_CHANCE_PER_VEHICLE_HOUR, ROAD_EVENT_COOLDOWN_MINUTES } from '../constants.js';
import { getDistance } from '../routing.js';
import { addTransaction } from './finance.js';
import {
  ensureProgressState, getVehicleDriver, getDriverSkill,
  emitProgressEvent, hasProgressHook, changeCompanyReputation,
} from './progression.js';
import { triggerPressConference } from './press.js';

const _cityName = id => (cityById[id] ? cityById[id].name : id);

function _nearCity(v) {
  const stops = v.route && v.route.stops;
  if (!stops || stops.length === 0) return _cityName(v.currentCity);
  const s = stops[Math.min(stops.length - 1, v.route.currentStopIndex + 1)];
  return _cityName(s.cityId);
}

/** Chance bonus for skilled drivers on risky choices (+5 % per level above 1). */
const _skillBonus = ctx => 0.05 * (ctx.skill - 1);

/**
 * Road event catalog. Each choice's `resolve(ctx)` returns an outcome:
 *   { text, tone: 'good'|'bad'|'neutral', effects: {...}, flags: {...} }
 * effects: money, rep, stopMinutes, health, satisfaction, skipKm, broken
 */
export const ROAD_EVENTS = [
  {
    id: 'traffic_jam', icon: '🚗', title: 'Stau!', weight: 3,
    text: ctx => `<strong>${ctx.driverName}</strong> steht kurz vor ${ctx.near} im Stau. Laut Verkehrsfunk dauert es mindestens zwei Stunden. Über die Landstraße könnte es schneller gehen …`,
    defaultChoice: 1,
    choices: [
      { label: '🛣️ Abkürzung über die Dörfer', hint: 'Riskant', risky: true,
        resolve: ctx => ctx.rng() < 0.55 + _skillBonus(ctx)
          ? { tone: 'good', text: `Geniale Idee! ${ctx.driverName} rauscht an der Blechlawine vorbei.`, effects: { skipKm: 40 }, flags: { riskWin: true } }
          : { tone: 'bad', text: 'Die Landstraße endet an einer Baustelle. Riesiger Umweg!', effects: { stopMinutes: 120 } } },
      { label: '⏳ Im Stau ausharren', hint: 'Sicher',
        resolve: () => ({ tone: 'neutral', text: 'Zähfließend, aber sicher. Das Radio spielt zum dritten Mal „Wind of Change“.', effects: { stopMinutes: 75 } }) },
    ],
  },
  {
    id: 'speed_trap', icon: '🚔', title: 'Zeitdruck', weight: 3,
    text: ctx => `${ctx.driverName} meldet sich per CB-Funk: „Chef, wenn ich ordentlich Gas gebe, bin ich ’ne Stunde früher da. Soll ich?“`,
    defaultChoice: 1,
    choices: [
      { label: '🏎️ Gas geben!', hint: 'Bußgeld möglich', risky: true,
        resolve: ctx => {
          if (ctx.rng() < 0.35 - 0.04 * (ctx.skill - 1)) {
            const fine = rand(150, 450);
            return { tone: 'bad', text: `Geblitzt! Die Polizei kassiert ${fmt.money(fine)} – und die Lokalzeitung berichtet.`, effects: { money: -fine, rep: -1 } };
          }
          return { tone: 'good', text: 'Kein Blitzer weit und breit – freie Fahrt!', effects: { skipKm: 60 }, flags: { riskWin: true } };
        } },
      { label: '🐢 Vorschriftsmäßig fahren', hint: 'Sicher',
        resolve: () => ({ tone: 'neutral', text: 'Sicher ist sicher. Der Tacho bleibt bei 80.', effects: {} }) },
    ],
  },
  {
    id: 'warning_light', icon: '🔧', title: 'Motorwarnleuchte', weight: 2,
    text: ctx => `Im Cockpit von <strong>${ctx.vehicleName}</strong> leuchtet plötzlich eine orange Warnlampe. ${ctx.driverName} fragt, was zu tun ist.`,
    defaultChoice: 0,
    choices: [
      { label: '🔧 Nächste Werkstatt anfahren', hint: 'Kostet Zeit & Geld',
        resolve: ctx => {
          const cost = rand(250, 600);
          return { tone: 'neutral', text: `Ein lockerer Sensor – in 90 Minuten erledigt. Rechnung: ${fmt.money(cost)}.`, effects: { money: -cost, stopMinutes: 90, health: 15 } };
        } },
      { label: '🤞 Ignorieren und weiterfahren', hint: 'Pannengefahr!', risky: true,
        resolve: ctx => ctx.rng() < 0.4 - 0.05 * (ctx.skill - 1)
          ? { tone: 'bad', text: `Rumms! Motorschaden. ${ctx.vehicleName} bleibt liegen und muss im Fuhrpark repariert werden.`, effects: { health: -20, broken: true } }
          : { tone: 'good', text: 'Die Lampe geht von selbst wieder aus. Glück gehabt!', effects: {}, flags: { riskWin: true } } },
    ],
  },
  {
    id: 'hitchhiker', icon: '👍', title: 'Anhalter', weight: 2,
    text: ctx => `An einer Raststätte hält ein Anhalter ein Pappschild hoch: „${ctx.randomCity}“. Er sieht freundlich aus … oder?`,
    defaultChoice: 1,
    choices: [
      { label: '🤝 Mitnehmen', hint: 'Überraschung',
        resolve: ctx => {
          if (ctx.rng() < 0.75) {
            return { tone: 'good', text: 'Der Anhalter entpuppt sich als Lokalreporter und schreibt einen begeisterten Artikel über deine hilfsbereiten Fahrer!', effects: { rep: 3, satisfaction: 5 }, flags: { hitchhiker: true } };
          }
          const loss = rand(200, 500);
          return { tone: 'bad', text: `Beim Abschied fehlt die Spesenkasse – ${fmt.money(loss)} futsch!`, effects: { money: -loss }, flags: { hitchhiker: true } };
        } },
      { label: '🚫 Weiterfahren', hint: 'Sicher',
        resolve: () => ({ tone: 'neutral', text: 'Der Anhalter winkt enttäuscht hinterher.', effects: {} }) },
    ],
  },
  {
    id: 'tired', icon: '😴', title: 'Übermüdung', weight: 2,
    text: ctx => `${ctx.driverName} ist seit Stunden unterwegs und gähnt ununterbrochen. Bis zum Ziel ist es noch ein ganzes Stück.`,
    defaultChoice: 0,
    choices: [
      { label: '☕ Pause an der Raststätte', hint: '45 Min',
        resolve: () => ({ tone: 'good', text: 'Kaffee, Schnitzel mit Pommes, 20 Minuten Nickerchen – frisch wie ein junger Morgen.', effects: { stopMinutes: 45, satisfaction: 5, money: -15 } }) },
      { label: '💪 Durchziehen', hint: 'Unfallgefahr!', risky: true,
        resolve: ctx => ctx.rng() < 0.2 - 0.03 * (ctx.skill - 1)
          ? { tone: 'bad', text: `Sekundenschlaf! ${ctx.vehicleName} landet im Graben. Niemand verletzt, aber die Presse ist schon da …`, effects: { health: -30, rep: -3, stopMinutes: 120, satisfaction: -10 }, flags: { accident: true } }
          : { tone: 'neutral', text: `Geschafft – aber ${ctx.driverName} ist ziemlich sauer auf dich.`, effects: { satisfaction: -5 }, flags: { riskWin: true } } },
    ],
  },
  {
    id: 'side_cargo', icon: '📦', title: 'Beiladung', weight: 2,
    prepare: () => ({ amount: rand(4, 12) * 100 }),
    text: ctx => `Ein Disponent auf dem Autohof bietet ${ctx.driverName} eine Beiladung für <strong>${fmt.money(ctx.data.amount)}</strong> an – bar auf die Hand, keine Fragen.`,
    defaultChoice: 1,
    choices: [
      { label: '💶 Annehmen', hint: 'Zollkontrolle möglich', risky: true,
        resolve: ctx => ctx.rng() < 0.8
          ? { tone: 'good', text: 'Leicht verdientes Geld!', effects: { money: ctx.data.amount, stopMinutes: 30 }, flags: { riskWin: true } }
          : { tone: 'bad', text: `Zollkontrolle! Die Beiladung war Schmuggelware. Strafe: ${fmt.money(ctx.data.amount * 2)}.`, effects: { money: -ctx.data.amount * 2, rep: -4, stopMinutes: 90 } } },
      { label: '🙅 Ablehnen', hint: 'Sicher',
        resolve: () => ({ tone: 'neutral', text: 'Saubere Weste behalten.', effects: {} }) },
    ],
  },
  {
    id: 'cows', icon: '🐄', title: 'Kühe auf der Fahrbahn', weight: 2,
    text: () => 'Eine Herde Kühe blockiert die Landstraße. Der Bauer ist weit und breit nicht zu sehen.',
    defaultChoice: 1,
    choices: [
      { label: '📯 Hupen', hint: 'Glückssache',
        resolve: ctx => ctx.rng() < 0.5
          ? { tone: 'good', text: 'Die Kühe trotten gemächlich davon.', effects: { stopMinutes: 10 } }
          : { tone: 'bad', text: 'Die Kühe sind wenig beeindruckt … und legen sich hin.', effects: { stopMinutes: 50 } } },
      { label: '🧑‍🌾 Bauer suchen', hint: '30 Min',
        resolve: ctx => ctx.rng() < 0.4
          ? { tone: 'good', text: 'Der Bauer bedankt sich mit einer Kanne frischer Milch. Die Laune steigt!', effects: { stopMinutes: 30, satisfaction: 5 } }
          : { tone: 'neutral', text: 'Der Bauer treibt die Herde von der Straße. Weiter geht’s.', effects: { stopMinutes: 30 } } },
      { label: '🚜 Über den Feldweg', hint: 'Riskant', risky: true,
        resolve: ctx => ctx.rng() < 0.7 + _skillBonus(ctx)
          ? { tone: 'good', text: 'Matsch spritzt, aber der LKW pflügt souverän durch!', effects: { skipKm: 10 }, flags: { riskWin: true } }
          : { tone: 'bad', text: 'Festgefahren im Matsch! Ein Traktor muss ziehen.', effects: { stopMinutes: 60, health: -10 } } },
    ],
  },
  {
    id: 'tv_crew', icon: '📺', title: 'Fernsehteam', weight: 1,
    text: ctx => `Ein Team vom „Trucker-Magazin“ möchte <strong>${ctx.vehicleName}</strong> für eine Reportage filmen.`,
    defaultChoice: 1,
    choices: [
      { label: '🎬 Klar, gerne!', hint: 'Zustand zählt',
        resolve: ctx => {
          const good = ctx.health >= 60 ? ctx.rng() < 0.85 : ctx.rng() < 0.35;
          return good
            ? { tone: 'good', text: 'Der Beitrag läuft zur besten Sendezeit – kostenlose Werbung!', effects: { rep: 4, stopMinutes: 40 } }
            : { tone: 'bad', text: 'Die Zuschauer sehen vor allem Rost und Dreck. Peinlich!', effects: { rep: -3, stopMinutes: 40 } };
        } },
      { label: '🙈 Keine Zeit', hint: 'Sicher',
        resolve: () => ({ tone: 'neutral', text: 'Das Team zieht weiter zur Konkurrenz.', effects: {} }) },
    ],
  },
  {
    id: 'breakdown', icon: '💥', title: 'Panne!', weight: 0,
    text: ctx => `Mit einem lauten Knall bleibt <strong>${ctx.vehicleName}</strong> bei ${ctx.near} liegen. Diagnose: Getriebeschaden.`,
    defaultChoice: 2,
    choices: [
      { label: '🚨 Abschleppdienst rufen', hint: 'Teuer, 4 Std.',
        resolve: ctx => {
          const cost = Math.round(ctx.purchasePrice * 0.03);
          return { tone: 'neutral', text: `Der Abschleppdienst bringt ${ctx.vehicleName} in eine Werkstatt. Kosten: ${fmt.money(cost)}.`, effects: { money: -cost, stopMinutes: 240, health: 25 }, flags: { survived: true } };
        } },
      { label: '🧰 Eigenen Mechaniker schicken', hint: 'Günstig, 3 Std.', requires: 'mechanic',
        resolve: () => ({ tone: 'good', text: 'Dein Mechaniker rückt mit Werkzeugkiste und Thermoskanne an. Läuft wieder!', effects: { money: -300, stopMinutes: 180, health: 35 }, flags: { survived: true } }) },
      { label: '⏸️ Später entscheiden', hint: 'Fahrzeug bleibt liegen',
        resolve: ctx => ({ tone: 'bad', text: `${ctx.vehicleName} bleibt liegen. Reparatur über den Fuhrpark (🔧 Reparieren).`, effects: { broken: true } }) },
    ],
  },
];

// ── Runtime state (not persisted) ────────────────────────────
let _pending = null;

export function hasPendingRoadEvent() { return !!_pending; }

function _hasMechanic() { return GS.staff.some(s => s.role === 'mechanic'); }

function _buildContext(v, inst, rng) {
  const driver = getVehicleDriver(v);
  const cat = DATA.VEHICLES.find(c => c.id === v.catalogId) || {};
  return {
    v, rng, data: inst.data || {},
    driverName: driver ? driver.name : 'Der Fahrer',
    vehicleName: v.name,
    skill: getDriverSkill(v),
    health: v.health,
    purchasePrice: cat.purchasePrice || 50000,
    near: _nearCity(v),
    randomCity: inst.randomCity,
  };
}

function _eligibleVehicles() {
  return GS.vehicles.filter(v =>
    v.status === 'driving' && v.driverId &&
    !(v.refuelPauseMinutes > 0) && !(v.stopMinutes > 0) &&
    v.route && v.route.stops && v.route.stops.length > 1
  );
}

/** Builds the UI-facing description of an event instance. */
function _present(inst) {
  const def = ROAD_EVENTS.find(e => e.id === inst.eventId);
  const v = GS.vehicles.find(x => x.id === inst.vehicleId);
  const ctx = _buildContext(v, inst, Math.random);
  return {
    icon: def.icon,
    title: def.title,
    vehicleName: v.name,
    catalogId: v.catalogId,
    text: def.text(ctx),
    choices: def.choices.map(c => ({
      label: c.label, hint: c.hint, risky: !!c.risky,
      disabled: c.requires === 'mechanic' && !_hasMechanic(),
    })),
    defaultChoice: def.defaultChoice,
  };
}

/**
 * Starts a specific road event for a vehicle (used by the random trigger and tests).
 * Returns the event instance or null.
 */
export function startRoadEvent(eventId, vehicle) {
  const def = ROAD_EVENTS.find(e => e.id === eventId);
  if (!def || !vehicle || _pending) return null;
  const p = ensureProgressState();
  p.lastRoadEventMinute = GS.time.totalMinutes;
  p.roadEventsSeen++;
  _pending = {
    eventId,
    vehicleId: vehicle.id,
    data: def.prepare ? def.prepare() : {},
    randomCity: pick(DATA.CITIES).name,
  };
  emitProgressEvent('road-event', _present(_pending));
  return _pending;
}

/** Called once per game hour by the engine. Only fires when a UI presenter is registered. */
export function maybeTriggerRoadEvent(rng = Math.random) {
  if (_pending || !hasProgressHook('road-event')) return null;
  const p = ensureProgressState();
  if (GS.time.totalMinutes - p.lastRoadEventMinute < ROAD_EVENT_COOLDOWN_MINUTES) return null;

  const vehicles = _eligibleVehicles();
  if (vehicles.length === 0) return null;

  const wrecks = vehicles.filter(v => v.health < 35);
  if (wrecks.length > 0 && rng() < 0.08) return startRoadEvent('breakdown', pick(wrecks));

  const chance = Math.min(0.5, ROAD_EVENT_CHANCE_PER_VEHICLE_HOUR * vehicles.length);
  if (rng() >= chance) return null;

  const pool = ROAD_EVENTS.filter(e => e.weight > 0);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  let def = pool[pool.length - 1];
  for (const e of pool) { r -= e.weight; if (r <= 0) { def = e; break; } }
  return startRoadEvent(def.id, pick(vehicles));
}

function _applySkipKm(v, km) {
  const stops = v.route.stops;
  const idx = v.route.currentStopIndex;
  const from = stops[idx], to = stops[idx + 1];
  if (!from || !to) return;
  const legDist = getDistance(from.cityId, to.cityId);
  if (legDist <= 0) return;
  const done = (v.route.progressPct / 100) * legDist;
  const target = Math.min(legDist * 0.95, done + km);
  v.route.progressPct = (target / legDist) * 100;
}

/** Applies an outcome's effects and returns human-readable summary lines. */
export function applyRoadEventOutcome(v, outcome) {
  const e = outcome.effects || {};
  const f = outcome.flags || {};
  const p = ensureProgressState();
  const lines = [];
  const driver = getVehicleDriver(v);

  if (e.money) {
    addTransaction(`Unterwegs: ${v.name}`, e.money);
    lines.push(`${e.money > 0 ? '+' : '−'}${fmt.money(Math.abs(e.money))}`);
  }
  if (e.rep) {
    const d = changeCompanyReputation(e.rep);
    if (d) lines.push(`${d > 0 ? '+' : '−'}${Math.abs(d)} Ansehen`);
  }
  if (e.stopMinutes) {
    v.stopMinutes = (v.stopMinutes || 0) + e.stopMinutes;
    lines.push(`+${e.stopMinutes} Min Verzögerung`);
  }
  if (e.skipKm && v.status === 'driving') {
    _applySkipKm(v, e.skipKm);
    lines.push(`⏩ ${e.skipKm} km Vorsprung`);
  }
  if (e.health) {
    v.health = Math.max(0, Math.min(100, v.health + e.health));
    lines.push(`Zustand ${e.health > 0 ? '+' : '−'}${Math.abs(e.health)} %`);
  }
  if (e.satisfaction && driver) {
    driver.satisfaction = Math.max(0, Math.min(100, (driver.satisfaction || 70) + e.satisfaction));
    lines.push(`Fahrerlaune ${e.satisfaction > 0 ? '+' : '−'}${Math.abs(e.satisfaction)}`);
  }
  if (e.broken) {
    v.status = 'broken';
    lines.push('🚨 Fahrzeug liegt fest');
  }

  if (f.riskWin) p.riskWins++;
  if (f.hitchhiker) p.hitchhikers++;
  if (f.survived) p.breakdownsSurvived++;

  return lines;
}

/**
 * Resolves the pending road event with the given choice.
 * Returns { tone, text, lines } for the UI, or null when nothing is pending.
 */
export function resolveRoadEvent(choiceIdx, rng = Math.random) {
  if (!_pending) return null;
  const inst = _pending;
  _pending = null;

  const def = ROAD_EVENTS.find(e => e.id === inst.eventId);
  const v = GS.vehicles.find(x => x.id === inst.vehicleId);
  if (!def || !v) return null;

  let idx = Number.isInteger(choiceIdx) ? choiceIdx : def.defaultChoice;
  let choice = def.choices[idx];
  if (!choice || (choice.requires === 'mechanic' && !_hasMechanic())) {
    idx = def.defaultChoice;
    choice = def.choices[idx];
  }

  const ctx = _buildContext(v, inst, rng);
  const outcome = choice.resolve(ctx);
  const lines = applyRoadEventOutcome(v, outcome);

  if (outcome.flags && outcome.flags.accident) triggerPressConference('accident');
  else if (outcome.effects && outcome.effects.broken) triggerPressConference('breakdown');

  emitProgressEvent('progress-check');
  return { tone: outcome.tone, text: outcome.text, lines, icon: def.icon, title: def.title };
}

/** Test helper: clears any pending event. */
export function _resetRoadEvents() { _pending = null; }
