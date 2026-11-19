import { DATA } from '../data.js';
import { GS, cityById } from '../state.js';
import {
  STREAK_BONUS_PER_STEP, STREAK_BONUS_MAX,
  GOLD_ORDER_VALUE_MULT, GOLD_ORDER_EXPIRY_DAYS,
  DRIVER_XP_PER_LEVEL, DRIVER_MAX_SKILL, DRIVER_TITLES,
} from '../constants.js';
import { getReputationTier } from './orders.js';
import { addTransaction } from './finance.js';

// ── UI hook registry (keeps this module DOM-free and testable) ─
const _hooks = {};
export function registerProgressHook(name, fn) { (_hooks[name] = _hooks[name] || []).push(fn); }
export function hasProgressHook(name) { return !!(_hooks[name] && _hooks[name].length); }
export function emitProgressEvent(name, payload) { (_hooks[name] || []).forEach(fn => fn(payload)); }
const _emit = emitProgressEvent;

/** Changes the company reputation (clamped 0–100) and notifies listeners (tier checks). */
export function changeCompanyReputation(delta) {
  const oldRep = GS.company.reputation || 50;
  const newRep = Math.max(0, Math.min(100, oldRep + delta));
  GS.company.reputation = newRep;
  _emit('rep-changed', { oldRep, newRep });
  return newRep - oldRep;
}

export function createProgressState() {
  return {
    streak: 0,
    bestStreak: 0,
    onTimeDeliveries: 0,
    lateDeliveries: 0,
    goldDelivered: 0,
    specialDelivered: 0,
    maxDeliveredWeight: 0,
    countries: [],
    nightDeliveries: 0,
    riskWins: 0,
    hitchhikers: 0,
    breakdownsSurvived: 0,
    pressPositive: 0,
    lastPressMinute: null,
    recentLate: [],
    lastRoadEventMinute: 0,
    roadEventsSeen: 0,
    wentBroke: false,
    chapter: 0,
    chapterIntroShown: false,
    campaignDone: false,
    achievements: {},
  };
}

/** Ensures GS.progress exists and carries every field (save-game migration). */
export function ensureProgressState() {
  const fresh = createProgressState();
  if (!GS.progress || typeof GS.progress !== 'object') { GS.progress = fresh; return GS.progress; }
  for (const [k, v] of Object.entries(fresh)) {
    if (GS.progress[k] === undefined) GS.progress[k] = v;
  }
  return GS.progress;
}

function _dateStamp() {
  const { day, month, year } = GS.time;
  return { day, month, year };
}

// ── Punctuality streak ───────────────────────────────────────
export function getStreakBonusPct(streak) {
  return Math.min(STREAK_BONUS_MAX, Math.max(0, streak) * STREAK_BONUS_PER_STEP);
}

/** Bonus fraction the *next* on-time delivery will earn. */
export function currentStreakBonusPct() {
  return getStreakBonusPct(ensureProgressState().streak);
}

// ── Gold orders ──────────────────────────────────────────────
/** Upgrades a freshly generated order to a gold (VIP) order in place. */
export function makeGoldOrder(order) {
  order.isGold        = true;
  order.isUrgent      = false;
  order.urgencyFactor = 1.0;
  order.value         = Math.round(order.value * GOLD_ORDER_VALUE_MULT);
  order.bonus         = Math.round(order.bonus * 2);
  order.expiresInDays = GOLD_ORDER_EXPIRY_DAYS;
  order.deadlineDays  = Math.max(order.deadlineDays, 2);
  return order;
}

export function announceGoldOrder(order) { _emit('gold-offer', order); }

// ── Driver experience ────────────────────────────────────────
export function xpForNextLevel(skill) { return skill * DRIVER_XP_PER_LEVEL; }
export function getDriverTitle(skill) { return DRIVER_TITLES[skill] || DRIVER_TITLES[1]; }

export function getVehicleDriver(vehicle) {
  if (!vehicle || !vehicle.driverId) return null;
  return GS.staff.find(s => s.id === vehicle.driverId) || null;
}

export function getDriverSkill(vehicle) {
  const d = getVehicleDriver(vehicle);
  return d ? d.skill || 1 : 1;
}

/** Experienced drivers drive more economically: −3 % fuel per skill level above 1. */
export function driverFuelFactor(skill) {
  return 1 - 0.03 * (Math.max(1, Math.min(DRIVER_MAX_SKILL, skill)) - 1);
}

export function xpForDelivery(km, onTime) {
  return 10 + Math.round(km / 20) + (onTime ? 10 : 0);
}

/**
 * Grants XP to a driver and applies level-ups.
 * @returns {{gained:number, levelsGained:number}}
 */
export function grantDriverXp(driver, xp) {
  if (!driver) return { gained: 0, levelsGained: 0 };
  driver.xp = (driver.xp || 0) + xp;
  driver.deliveries = (driver.deliveries || 0) + 1;
  let levelsGained = 0;
  while (driver.skill < DRIVER_MAX_SKILL && driver.xp >= xpForNextLevel(driver.skill)) {
    driver.xp -= xpForNextLevel(driver.skill);
    driver.skill++;
    levelsGained++;
  }
  if (driver.skill >= DRIVER_MAX_SKILL) driver.xp = Math.min(driver.xp, xpForNextLevel(DRIVER_MAX_SKILL));
  if (levelsGained > 0) {
    driver.satisfaction = Math.min(100, (driver.satisfaction || 70) + 10 * levelsGained);
    _emit('driver-levelup', { driver, title: getDriverTitle(driver.skill) });
  }
  return { gained: xp, levelsGained };
}

// ── Delivery bookkeeping (called by the engine) ──────────────
/**
 * Records a finished order for streak, statistics and achievements.
 * Returns the streak bonus amount (in €) that was granted on top of the payout.
 */
export function recordDelivery(order, onTime, basePayout) {
  const p = ensureProgressState();
  let streakBonus = 0;

  if (onTime) {
    const pct = getStreakBonusPct(p.streak);
    streakBonus = Math.round(basePayout * pct);
    p.streak++;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    p.onTimeDeliveries++;
    if ([3, 5, 10, 15, 20].includes(p.streak)) _emit('streak', { streak: p.streak, nextPct: getStreakBonusPct(p.streak) });
  } else {
    if (p.streak >= 3) _emit('streak-lost', { streak: p.streak });
    p.streak = 0;
    p.lateDeliveries++;
    p.recentLate.push(GS.time.totalMinutes);
    p.recentLate = p.recentLate.filter(m => GS.time.totalMinutes - m <= 7 * 1440);
  }

  if (order.isGold && onTime) p.goldDelivered++;
  if ((order.requirements || []).length > 0) p.specialDelivered++;
  p.maxDeliveredWeight = Math.max(p.maxDeliveredWeight, order.weight || 0);
  const dest = cityById[order.destination];
  if (dest && dest.country && !p.countries.includes(dest.country)) p.countries.push(dest.country);
  if (GS.time.hour < 4) p.nightDeliveries++;

  return streakBonus;
}

// ── Story campaign ───────────────────────────────────────────
const _drivers   = () => GS.staff.filter(s => s.role === 'driver').length;
const _special   = () => GS.vehicles.filter(v => {
  const cat = DATA.VEHICLES.find(c => c.id === v.catalogId);
  const trl = v.trailerId ? DATA.TRAILERS.find(t => t.id === v.trailerId) : null;
  return (cat && cat.requirements.length > 0) || (trl && trl.requirements.length > 0);
}).length;
const _rep = () => GS.company.reputation || 50;

export const CHAPTERS = [
  {
    id: 'ch1',
    title: 'Kapitel 1: Onkel Heinz’ Erbe',
    intro: 'Frankfurt, März 1994. Dein Onkel Heinz hat dir seine kleine Spedition vererbt: einen klapprigen Transporter, einen Fahrer und eine Telefonistin, die mehr Kaffee kocht als Telefonate führt. Die Konkurrenz von <strong>Brummer &amp; Söhne</strong> lacht schon. Zeig ihnen, was in dir steckt!',
    outro: 'Die ersten Kunden sind zufrieden – und bei Brummer &amp; Söhne wird das Lachen leiser.',
    reward: 5000,
    objectives: [
      { label: '3 Aufträge pünktlich liefern', progress: () => [GS.progress.onTimeDeliveries, 3] },
      { label: '10.000 € Umsatz erzielen',     progress: () => [GS.stats.totalRevenue, 10000], money: true },
    ],
  },
  {
    id: 'ch2',
    title: 'Kapitel 2: Wachstumsschmerzen',
    intro: 'Das Telefon klingelt öfter, als ein einzelner Transporter fahren kann. Zeit, die Flotte zu vergrößern – aber Vorsicht: Jeder neue LKW braucht einen Fahrer, und Fahrer wollen bezahlt werden.',
    outro: 'Zwei LKW auf dem Hof! Die Nachbarn beschweren sich über den Lärm – ein gutes Zeichen.',
    reward: 10000,
    objectives: [
      { label: '2 Fahrzeuge besitzen',        progress: () => [GS.vehicles.length, 2] },
      { label: '2 Fahrer beschäftigen',       progress: () => [_drivers(), 2] },
      { label: '10 Aufträge abschließen',     progress: () => [GS.stats.ordersCompleted, 10] },
    ],
  },
  {
    id: 'ch3',
    title: 'Kapitel 3: Die Spezialisten',
    intro: 'Mit Stückgut allein wird man nicht reich. Kühlware, Gefahrgut und Schwerlast zahlen deutlich besser – wenn man die richtige Ausrüstung hat.',
    outro: 'Ein Chemiekonzern hat deinen Namen auf seine Lieferantenliste gesetzt. Die Branche wird aufmerksam.',
    reward: 15000,
    objectives: [
      { label: 'Spezialfahrzeug/-anhänger besitzen (Kühlung, ADR, Schwerlast)', progress: () => [_special(), 1] },
      { label: '1 Spezialfracht liefern',     progress: () => [GS.progress.specialDelivered, 1] },
      { label: 'Unternehmensansehen 60',      progress: () => [_rep(), 60] },
    ],
  },
  {
    id: 'ch4',
    title: 'Kapitel 4: Europa ruft',
    intro: 'Die Grenzen öffnen sich, der Binnenmarkt boomt. Wer jetzt international liefert, sichert sich die Kunden von morgen.',
    outro: 'Von Lissabon bis Helsinki kennt man jetzt deine LKW. Brummer &amp; Söhne bieten dir eine Fusion an – du lehnst lächelnd ab.',
    reward: 25000,
    objectives: [
      { label: 'In 5 verschiedene Länder liefern', progress: () => [GS.progress.countries.length, 5] },
      { label: '10.000 km fahren',                 progress: () => [Math.round(GS.stats.kmDriven), 10000] },
      { label: 'Serie von 5 pünktlichen Lieferungen', progress: () => [GS.progress.bestStreak, 5] },
    ],
  },
  {
    id: 'ch5',
    title: 'Kapitel 5: Der Mittelständler',
    intro: 'Aus der kleinen Klitsche ist ein ernstzunehmendes Unternehmen geworden. Jetzt geht es um Größe, Kapital und einen Namen, der Türen öffnet.',
    outro: 'Die Wirtschaftspresse nennt dich „den Aufsteiger des Jahres“. Onkel Heinz wäre stolz.',
    reward: 40000,
    objectives: [
      { label: '5 Fahrzeuge besitzen',      progress: () => [GS.vehicles.length, 5] },
      { label: 'Kontostand 150.000 €',      progress: () => [Math.round(GS.finance.balance), 150000], money: true },
      { label: 'Bekanntheitsgrad Stufe 4',  progress: () => [getReputationTier(_rep()), 4] },
    ],
  },
  {
    id: 'ch6',
    title: 'Kapitel 6: Das Logistik-Imperium',
    intro: 'Das letzte Ziel: die Nummer 1 in Europa werden. Dafür brauchst du eine große Flotte, zufriedene Kunden – und einen makellosen Ruf.',
    outro: 'Du hast es geschafft! Dein Name steht für Logistik in ganz Europa. Brummer &amp; Söhne haben übrigens Insolvenz angemeldet …',
    reward: 100000,
    objectives: [
      { label: '10 Fahrzeuge besitzen',     progress: () => [GS.vehicles.length, 10] },
      { label: '100 Aufträge abschließen',  progress: () => [GS.stats.ordersCompleted, 100] },
      { label: '1.000.000 € Gesamtumsatz',  progress: () => [GS.stats.totalRevenue, 1000000], money: true },
      { label: 'Unternehmensansehen 85',    progress: () => [_rep(), 85] },
    ],
  },
];

export function isStoryMode() { return GS.company.mode === 'story'; }

/** Returns the current chapter with evaluated objectives, or null when finished / sandbox. */
export function getChapterStatus() {
  const p = ensureProgressState();
  if (!isStoryMode() || p.campaignDone) return null;
  const chapter = CHAPTERS[p.chapter];
  if (!chapter) return null;
  const objectives = chapter.objectives.map(o => {
    const [cur, target] = o.progress();
    return { label: o.label, cur: Math.min(cur, target), target, done: cur >= target, money: !!o.money };
  });
  return { index: p.chapter, total: CHAPTERS.length, chapter, objectives, allDone: objectives.every(o => o.done) };
}

export function showChapterIntroIfNeeded() {
  const p = ensureProgressState();
  if (!isStoryMode() || p.campaignDone || p.chapterIntroShown) return;
  const chapter = CHAPTERS[p.chapter];
  if (!chapter) return;
  p.chapterIntroShown = true;
  _emit('chapter-intro', { chapter, index: p.chapter, total: CHAPTERS.length });
}

export function checkCampaign() {
  const status = getChapterStatus();
  if (!status || !status.allDone) return false;
  const p = GS.progress;
  const done = status.chapter;
  addTransaction(`Kapitelbelohnung: ${done.title}`, done.reward);
  p.chapter++;
  const next = CHAPTERS[p.chapter] || null;
  if (!next) p.campaignDone = true;
  p.chapterIntroShown = true;
  _emit('chapter-complete', { chapter: done, next, index: p.chapter, total: CHAPTERS.length });
  return true;
}

// ── Achievements ─────────────────────────────────────────────
export const ACHIEVEMENTS = [
  { id: 'first_delivery', icon: '🚚', title: 'Jungfernfahrt',          desc: 'Erste Lieferung abgeschlossen.',            check: () => GS.stats.ordersCompleted >= 1 },
  { id: 'deliveries_10',  icon: '📦', title: 'Fleißige Biene',         desc: '10 Aufträge abgeschlossen.',                check: () => GS.stats.ordersCompleted >= 10 },
  { id: 'deliveries_50',  icon: '🏭', title: 'Logistikprofi',          desc: '50 Aufträge abgeschlossen.',                check: () => GS.stats.ordersCompleted >= 50 },
  { id: 'deliveries_200', icon: '🌍', title: 'Lieferlegende',          desc: '200 Aufträge abgeschlossen.',               check: () => GS.stats.ordersCompleted >= 200 },
  { id: 'streak_5',       icon: '🔥', title: 'Heiße Serie',            desc: '5 pünktliche Lieferungen in Folge.',        check: () => GS.progress.bestStreak >= 5 },
  { id: 'streak_15',      icon: '☄️', title: 'Unaufhaltsam',           desc: '15 pünktliche Lieferungen in Folge.',       check: () => GS.progress.bestStreak >= 15 },
  { id: 'gold_first',     icon: '💎', title: 'Goldjunge',              desc: 'Ersten Goldauftrag pünktlich geliefert.',   check: () => GS.progress.goldDelivered >= 1 },
  { id: 'gold_5',         icon: '👑', title: 'Goldrausch',             desc: '5 Goldaufträge pünktlich geliefert.',       check: () => GS.progress.goldDelivered >= 5 },
  { id: 'fleet_3',        icon: '🚛', title: 'Kleine Flotte',          desc: '3 Fahrzeuge gleichzeitig besitzen.',        check: () => GS.vehicles.length >= 3 },
  { id: 'fleet_10',       icon: '🚥', title: 'Konvoi',                 desc: '10 Fahrzeuge gleichzeitig besitzen.',       check: () => GS.vehicles.length >= 10 },
  { id: 'rich',           icon: '💰', title: 'Viertelmillionär',       desc: 'Kontostand von 250.000 €.',                 check: () => GS.finance.balance >= 250000 },
  { id: 'millionaire',    icon: '🤑', title: 'Millionär',              desc: 'Kontostand von 1.000.000 €.',               check: () => GS.finance.balance >= 1000000 },
  { id: 'km_10000',       icon: '🛣️', title: 'Kilometerfresser',       desc: '10.000 km gefahren.',                       check: () => GS.stats.kmDriven >= 10000 },
  { id: 'km_100000',      icon: '🌐', title: 'Zweieinhalbmal um die Welt', desc: '100.000 km gefahren.',                  check: () => GS.stats.kmDriven >= 100000 },
  { id: 'countries_10',   icon: '🗺️', title: 'Grenzenlos',             desc: 'In 10 verschiedene Länder geliefert.',      check: () => GS.progress.countries.length >= 10 },
  { id: 'heavy_40t',      icon: '🏗️', title: 'Schwergewicht',          desc: 'Einen Auftrag mit ≥ 40 t geliefert.',       check: () => GS.progress.maxDeliveredWeight >= 40000 },
  { id: 'driver_legend',  icon: '🎖️', title: 'Legende der Landstraße', desc: 'Ein Fahrer erreicht Stufe 5.',              check: () => GS.staff.some(s => s.role === 'driver' && s.skill >= DRIVER_MAX_SKILL) },
  { id: 'reputation_95',  icon: '⭐', title: 'Liebling der Branche',   desc: 'Unternehmensansehen von 95 erreicht.',      check: () => _rep() >= 95 },
  { id: 'press_star',     icon: '🎤', title: 'Medienprofi',            desc: '3 Pressekonferenzen souverän gemeistert.',  check: () => GS.progress.pressPositive >= 3 },
  { id: 'survivor',       icon: '🔧', title: 'Pannenhelfer',           desc: 'Eine Panne überstanden.',                   check: () => GS.progress.breakdownsSurvived >= 1 },
  { id: 'risk_taker',     icon: '🎲', title: 'Zocker',                 desc: '5 riskante Entscheidungen gewonnen.',       check: () => GS.progress.riskWins >= 5 },
  { id: 'good_soul',      icon: '👍', title: 'Gute Seele',             desc: 'Einen Anhalter mitgenommen.',               check: () => GS.progress.hitchhikers >= 1 },
  { id: 'night_owl',      icon: '🦉', title: 'Nachteule',              desc: 'Eine Lieferung zwischen 0 und 4 Uhr.',      check: () => GS.progress.nightDeliveries >= 1, secret: true },
  { id: 'red_numbers',    icon: '📉', title: 'Rote Zahlen',            desc: 'Das Konto ist ins Minus gerutscht.',        check: () => GS.progress.wentBroke, secret: true },
  { id: 'empire',         icon: '🏆', title: 'Logistik-Imperium',      desc: 'Story-Kampagne abgeschlossen.',             check: () => GS.progress.campaignDone },
];

export function isAchievementUnlocked(id) { return !!ensureProgressState().achievements[id]; }

export function checkAchievements() {
  const p = ensureProgressState();
  if (GS.finance.balance < 0) p.wentBroke = true;
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(); } catch { ok = false; }
    if (ok) {
      p.achievements[a.id] = _dateStamp();
      unlocked.push(a);
      _emit('achievement', a);
    }
  }
  return unlocked;
}

/** Runs all progress checks (achievements + campaign). Cheap enough to call often. */
export function checkProgress() {
  if (!GS.started) return;
  checkCampaign();
  checkAchievements();
  _emit('progress-changed');
}
