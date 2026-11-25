import { DATA } from '../data.js';
import { GS } from '../state.js';
import { ensureProgressState } from './progression.js';
import { getFleetCapabilities, isOrderAvailable } from './orders.js';
import { getVehicleEffectiveCapacity, getVehicleEffectiveRequirements } from './vehicles.js';
import { findShortestPath, routeDistance } from '../routing.js';
import { uid } from '../utils.js';

// ── State helpers used by step conditions ────────────────────
const _completed = () => GS.stats.ordersCompleted || 0;
const _drivers = () => GS.staff.filter(staff => staff.role === 'driver').length;
const _isWorn = vehicle => vehicle.status === 'broken' || (vehicle.health ?? 100) < 70;
const _cheapestVehicle = () => Math.min(...DATA.VEHICLES.map(vehicle => vehicle.purchasePrice));

function _hasSpecialEquipment() {
  return GS.vehicles.some(vehicle => getVehicleEffectiveRequirements(vehicle).length > 0);
}

function _eligibleOrders(vehicle) {
  const capacity = getVehicleEffectiveCapacity(vehicle);
  const requirements = getVehicleEffectiveRequirements(vehicle);
  return GS.orders.available.filter(order =>
    isOrderAvailable(order)
    && order.weight <= capacity
    && (order.requirements || []).every(requirement => requirements.includes(requirement))
  );
}

/** Explains why no tour can be dispatched right now, or returns null when it can. */
export function getTourWaitReason() {
  const ready = GS.vehicles.filter(vehicle => vehicle.status === 'idle' && vehicle.driverId);
  if (ready.length === 0) {
    if (GS.vehicles.some(vehicle => vehicle.status === 'driving')) {
      return 'Dein Fahrzeug ist noch unterwegs oder auf dem Rückweg zur Zentrale. Spule mit ⏭ vor, bis es wieder bereitsteht.';
    }
    if (GS.vehicles.some(vehicle => vehicle.status === 'maintenance')) {
      return 'Dein Fahrzeug steht in der Werkstatt. Spule mit ⏭ vor, bis die Wartung beendet ist.';
    }
    if (GS.vehicles.some(vehicle => vehicle.status === 'broken')) {
      return 'Dein Fahrzeug ist liegengeblieben. Lass es im Fuhrpark reparieren.';
    }
    return 'Kein freies Fahrzeug hat einen Fahrer. Weise im Fuhrpark einen Fahrer zu.';
  }
  if (!ready.some(vehicle => _eligibleOrders(vehicle).length > 0)) {
    return 'Gerade passt kein Auftrag zu deinen freien Fahrzeugen. Neue Aufträge treffen alle paar Stunden ein – lass etwas Zeit vergehen.';
  }
  return null;
}

function _tenderWaitReason() {
  const open = (GS.tenders || []).filter(tender => tender.status === 'open');
  if (open.length === 0) {
    return 'Gerade läuft keine Ausschreibung. Neue Ausschreibungen erscheinen etwa alle drei Tage – lass etwas Zeit vergehen.';
  }
  const capabilities = getFleetCapabilities();
  const reputation = GS.company.reputation || 50;
  const feasible = open.some(tender =>
    reputation >= (tender.minRep || 0)
    && tender.weight <= capabilities.maxCapacity
    && (tender.requirements || []).every(requirement => capabilities.metReqs.has(requirement))
  );
  return feasible
    ? null
    : 'Die offenen Ausschreibungen verlangen mehr Nutzlast, Ausrüstung oder Ansehen, als du aktuell bietest. Warte auf eine passende oder erweitere deine Flotte.';
}

function _specialOrderWaitReason() {
  const capabilities = getFleetCapabilities();
  const available = GS.orders.available.some(order =>
    (order.requirements || []).length > 0
    && isOrderAvailable(order)
    && order.weight <= capabilities.maxCapacity
    && order.requirements.every(requirement => capabilities.metReqs.has(requirement))
  );
  return available
    ? null
    : 'Gerade gibt es keinen Spezialauftrag, den deine Ausrüstung erfüllt. Neue Aufträge treffen laufend ein – lass etwas Zeit vergehen.';
}

// ── Training orders for the tour chapter ─────────────────────
const _roadKm = (from, to) => routeDistance(findShortestPath(from, to).map(cityId => ({ cityId })));

/**
 * Picks a two-leg chain starting at `startCity`: start → A, then a backload
 * A → B where B lies closer to the start than A, so the tour ends near home.
 */
export function planTrainingChain(startCity) {
  const cities = DATA.CITIES.filter(city => city.id !== startCity);
  const firstLegs = cities
    .map(city => ({ id: city.id, km: _roadKm(startCity, city.id) }))
    .filter(leg => leg.km >= 120 && leg.km <= 320)
    .sort((a, b) => Math.abs(a.km - 220) - Math.abs(b.km - 220));

  for (const first of firstLegs) {
    const backloads = cities
      .filter(city => city.id !== first.id)
      .map(city => ({ id: city.id, km: _roadKm(first.id, city.id), home: _roadKm(city.id, startCity) }))
      .filter(leg => leg.km >= 100 && leg.km <= 320 && leg.home < first.km)
      .sort((a, b) => (a.km + a.home) - (b.km + b.home));
    if (backloads.length > 0) {
      return [
        { origin: startCity, destination: first.id, km: first.km },
        { origin: first.id, destination: backloads[0].id, km: backloads[0].km },
      ];
    }
  }
  return null;
}

function _trainingOrder(leg, weight, sequence) {
  const client = DATA.CLIENTS.find(item => item.preferredCargo?.includes('auto')) || DATA.CLIENTS[0];
  const value = Math.round(leg.km * 9);
  const { day, month, year, hour, minute } = GS.time;
  return {
    id: uid(),
    isTutorial: true,
    tutorialSeq: sequence,
    clientId: client.id,
    clientName: client.name,
    industry: client.industry,
    origin: leg.origin,
    destination: leg.destination,
    cargoDesc: sequence === 0 ? 'Übungsfracht: Ersatzteile' : 'Übungsfracht: Leergut-Rücknahme',
    cargoType: 'auto',
    weight,
    remainingWeight: weight,
    tripsCompleted: 0,
    requirements: [],
    value,
    penalty: Math.round(value * 0.05),
    bonus: Math.round(value * 0.1),
    deadlineDays: 4,
    isUrgent: false,
    urgencyFactor: 1,
    freightFactor: 1,
    pricePerKm: 9,
    expiresInDays: 3,
    receivedMinute: GS.time.totalMinutes,
    receivedAt: { day, month, year, hour, minute },
    channel: 'phone',
    status: 'available',
    vehicleId: null,
    acceptedMinute: null,
    acceptedAt: null,
    pickedUpAt: null,
    completedMinute: null,
    completedAt: null,
    expiredAt: null,
    finalValue: null,
  };
}

/**
 * Places a combinable two-order chain at the location of a ready vehicle.
 * Idempotent: does nothing while training orders are still open or running.
 * @returns {object[]} the newly created orders
 */
export function ensureTrainingOrders() {
  const pending = order => order.isTutorial;
  if (GS.orders.available.some(order => pending(order) && isOrderAvailable(order))) return [];
  if (GS.orders.active.some(pending)) return [];
  const vehicle = GS.vehicles.find(item => item.status === 'idle' && item.driverId);
  if (!vehicle) return [];
  const chain = planTrainingChain(vehicle.currentCity || vehicle.homeCity);
  if (!chain) return [];
  const capacity = getVehicleEffectiveCapacity(vehicle);
  const weight = Math.max(1000, Math.min(2000, Math.floor(capacity / 1000) * 1000));
  const orders = chain.map((leg, index) => _trainingOrder(leg, weight, index));
  GS.orders.available.push(...orders);
  return orders;
}

export function getTrainingOrders() {
  return GS.orders.available
    .filter(order => order.isTutorial && isOrderAvailable(order))
    .sort((a, b) => a.tutorialSeq - b.tutorialSeq);
}

const NAV = screen => `.nav-btn[data-screen="${screen}"]`;

/**
 * Each chapter consists of concrete steps. A step is done either when its
 * `check()` holds or when a matching tutorial event passes `accept()`.
 * `wait()` explains why a step cannot be performed right now. Events are
 * evaluated after the action already changed the game state, so readiness
 * gates belong into `accept()` only for actions that do not change it.
 */
export const TUTORIAL_CHAPTERS = [
  {
    id: 'first-order',
    icon: '📞',
    title: 'Der erste Auftrag',
    summary: 'Onkel Heinz’ Transporter steht bereit. Zeit für die erste bezahlte Fahrt!',
    unlockHint: 'Direkt zu Spielbeginn verfügbar.',
    isUnlocked: () => true,
    steps: [
      {
        text: 'Öffne links die Auftragsliste 📋.',
        hint: 'Jeder Bildschirmwechsel kostet 5 Spielminuten – in der Logistik ist Zeit Geld.',
        target: [NAV('orders')],
        check: () => GS.ui.currentScreen === 'orders',
      },
      {
        text: 'Wähle bei einem Auftrag mit ✔ deinen Transporter und klicke „✓ Annehmen“.',
        hint: 'Dein Transporter trägt 2 t. Kurze Strecken mit großzügiger Frist sind ideal für den Start.',
        target: ['#order-list-available .order-card .btn-success', NAV('orders')],
        check: () => GS.orders.active.length > 0 || _completed() > 0,
      },
    ],
    lessons: [
      ['Machbarkeit', 'Ein ✔ zeigt, dass dein Fuhrpark Gewicht und Anforderungen erfüllt. Ein ✗ verrät den Grund.'],
      ['Frist & ETA', 'Bei der Fahrzeugwahl siehst du, ab wann der LKW abholen kann. Plane immer einen Puffer zur Frist ein.'],
      ['Bezahlung', 'Geld gibt es erst bei Ablieferung – verspätete Lieferungen kosten Strafe und Ansehen.'],
    ],
  },
  {
    id: 'on-the-road',
    icon: '⏱️',
    title: 'Unterwegs',
    summary: 'Dein LKW ist losgefahren. Lerne, die Zeit zu steuern und Fahrten zu verfolgen.',
    unlockHint: 'Nimm deinen ersten Auftrag an.',
    isUnlocked: () => GS.orders.active.length > 0 || _completed() > 0,
    steps: [
      {
        text: 'Öffne die Karte 🗺️ und finde deinen LKW.',
        hint: 'Klicke auf ein Fahrzeug, um Route, Ladung und nächste Station zu sehen.',
        target: [NAV('map')],
        event: 'screen:map',
      },
      {
        text: 'Beschleunige die Zeit mit „5×“ oder springe mit „⏭“ zum nächsten Ereignis.',
        hint: '⏭ spult bis zur nächsten Ankunft vor. Bei wichtigen Meldungen pausiert das Spiel automatisch.',
        target: ['#btn-skip-event', '.speed-btn[data-speed="5"]'],
        event: 'time-skip',
        check: () => GS.speed > 1,
      },
      {
        text: 'Warte, bis deine erste Lieferung abgeschlossen ist.',
        hint: 'Nach der Ablieferung wird bezahlt. Danach fährt der LKW zurück zur Zentrale.',
        target: ['#btn-skip-event'],
        check: () => _completed() >= 1,
      },
    ],
    lessons: [
      ['Zeit ist eine Ressource', 'Jede Aktion im Büro kostet Spielzeit. Plane mehrere Entscheidungen, bevor du die Zeit laufen lässt.'],
      ['Ereignisse unterwegs', 'Fahrer melden sich per Funk mit Entscheidungen. Erfahrene Fahrer meistern Risiken besser.'],
      ['Rückfahrt', 'Nach einer Einzelfahrt kehrt der LKW leer zurück. Leerkilometer kosten Diesel, bringen aber nichts ein.'],
    ],
  },
  {
    id: 'tour-planning',
    icon: '🗺️',
    title: 'Touren planen',
    summary: 'Statt leer zurückzufahren, verbindest du mehrere Ladungen zu einer Tour.',
    unlockHint: 'Schließe deine erste Lieferung ab.',
    isUnlocked: () => _completed() >= 1,
    prepare: ensureTrainingOrders,
    steps: [
      {
        text: 'Öffne in den Aufträgen den Tourenplaner „🗺️ Tour planen“.',
        hint: 'Der Planer zeigt nur Fahrzeuge, die auf dem Hof stehen und einen Fahrer haben.',
        target: ['.tour-planner-entry', NAV('orders')],
        event: 'tour-planner-opened',
        accept: () => !getTourWaitReason(),
        wait: getTourWaitReason,
      },
      {
        text: 'Kombiniere die beiden 🎓 Übungsaufträge zu einer Tour und starte sie.',
        hint: 'Die Anleitung im Tourenplaner zeigt dir, welchen Auftrag du als Nächstes anklicken musst.',
        target: ['.tour-planner-entry', NAV('orders')],
        event: 'tour-dispatched',
        accept: payload => payload.orderCount >= Math.min(2, payload.eligibleCount || 1),
        wait: getTourWaitReason,
      },
    ],
    lessons: [
      ['Reihenfolge zählt', 'Die Stopps werden in der geplanten Reihenfolge angefahren. Mit ▲▼ veränderst du Leerfahrt und Termine.'],
      ['Fristen im Blick', 'Gelbe oder rote Zeiten warnen vor knappen oder verpassten Lieferfristen.'],
      ['Lenkzeiten', 'Fahrer brauchen Pausen. Der Planer zeigt Pflichtpausen und wann der Fahrer wieder verfügbar ist.'],
    ],
  },
  {
    id: 'fleet-and-staff',
    icon: '🚛',
    title: 'Die Firma wächst',
    summary: 'Ein LKW allein reicht nicht. Stelle einen Fahrer ein und erweitere deinen Fuhrpark.',
    unlockHint: 'Schließe drei Lieferungen ab.',
    isUnlocked: () => _completed() >= 3,
    steps: [
      {
        text: 'Prüfe in den Finanzen 💰, wie viel Geld du investieren kannst.',
        hint: `Der günstigste Neuwagen kostet ${_cheapestVehicle().toLocaleString('de-DE')} €. Denke auch an Gehalt und Unterhalt.`,
        target: [NAV('finance')],
        event: 'screen:finance',
      },
      {
        text: 'Stelle im Personal 👥 einen zweiten Fahrer ein.',
        hint: 'Achte auf Fähigkeiten und Gehalt. Erfahrene Fahrer sparen Diesel und meistern Ereignisse besser.',
        target: [NAV('personnel')],
        check: () => _drivers() >= 2,
      },
      {
        text: 'Kaufe im Fuhrpark unter „Fahrzeuge kaufen“ ein zweites Fahrzeug.',
        hint: 'Ein größerer LKW öffnet schwerere und besser bezahlte Aufträge.',
        target: ['#fleet-tab-buy', NAV('fleet')],
        check: () => GS.vehicles.length >= 2,
        wait: () => GS.finance.balance >= _cheapestVehicle()
          ? null
          : `Dir fehlen noch ${Math.ceil(_cheapestVehicle() - GS.finance.balance).toLocaleString('de-DE')} € für ein weiteres Fahrzeug. Erledige weitere Aufträge.`,
      },
      {
        text: 'Weise dem neuen Fahrzeug im Fuhrpark deinen Fahrer zu.',
        hint: 'Ohne Fahrer bleibt ein Fahrzeug auf dem Hof stehen.',
        target: [NAV('fleet')],
        check: () => GS.vehicles.length >= 2 && GS.vehicles.every(vehicle => vehicle.driverId),
      },
    ],
    lessons: [
      ['Fixkosten', 'Jeder LKW und jeder Mitarbeiter kostet monatlich Geld – auch wenn er nur auf dem Hof steht.'],
      ['Auslastung', 'Mehr Fahrzeuge lohnen sich nur, wenn genug passende Aufträge da sind.'],
      ['Zufriedenheit', 'Unzufriedenes Personal kündigt. Ein Bonus im Personalbüro hält gute Leute.'],
    ],
  },
  {
    id: 'workshop',
    icon: '🔧',
    title: 'Werkstatt & Verschleiß',
    summary: 'Eines deiner Fahrzeuge ist abgenutzt. Verschleiß kostet Tempo, Diesel – und erhöht das Pannenrisiko.',
    unlockHint: 'Wird freigeschaltet, sobald ein Fahrzeug unter 70 % Zustand fällt.',
    isUnlocked: () => GS.vehicles.some(_isWorn),
    steps: [
      {
        text: 'Öffne den Fuhrpark 🚛 und finde das abgenutzte Fahrzeug.',
        hint: 'Der Zustandsbalken zeigt, wie fit ein Fahrzeug ist.',
        target: [NAV('fleet')],
        event: 'screen:fleet',
      },
      {
        text: 'Schicke es mit „🔧 Wartung“ in die Werkstatt.',
        hint: 'Die Wartung dauert eine Weile. Plane sie zwischen zwei Touren ein.',
        target: ['#fleet-list .btn-warning', NAV('fleet')],
        event: 'maintenance-started',
        check: () => !GS.vehicles.some(_isWorn),
        wait: () => GS.vehicles.some(vehicle => (vehicle.status === 'idle' && _isWorn(vehicle)) || vehicle.status === 'broken')
          ? null
          : 'Das Fahrzeug ist noch unterwegs. Sobald es auf dem Hof steht, erscheint der Knopf „🔧 Wartung“.',
      },
    ],
    lessons: [
      ['Vorbeugen', 'Regelmäßige Wartung ist billiger als ein Abschleppdienst mitten auf der Autobahn.'],
      ['Mechaniker', 'Ein eigener Mechaniker hilft bei Pannen unterwegs.'],
      ['Timing', 'Warte Fahrzeuge, wenn ohnehin wenig passende Aufträge im Markt sind.'],
    ],
  },
  {
    id: 'finance-and-contracts',
    icon: '📨',
    title: 'Ausschreibungen & Verträge',
    summary: 'Feste Wochenverträge bringen planbare Einnahmen. Bewirb dich um eine Ausschreibung.',
    unlockHint: 'Schließe fünf Lieferungen ab.',
    isUnlocked: () => _completed() >= 5,
    steps: [
      {
        text: 'Öffne in den Aufträgen eine Vertragsausschreibung 📨.',
        hint: 'Ausschreibungen stehen über dem Frachtmarkt. Prüfe Gewicht, Anforderungen und Mindestansehen.',
        target: ['.tender-card', NAV('orders')],
        event: 'tender-opened',
        accept: () => !_tenderWaitReason(),
        wait: _tenderWaitReason,
      },
      {
        text: 'Gib ein Angebot ab.',
        hint: 'Ein günstiges Angebot erhöht die Gewinnchance, senkt aber den Ertrag jeder Vertragsfahrt.',
        target: ['.tender-card', NAV('orders')],
        event: 'tender-bid',
        wait: _tenderWaitReason,
      },
    ],
    lessons: [
      ['Planbarkeit', 'Vertragsladungen kommen regelmäßig – ideal als Basis für Touren mit Rückladungen.'],
      ['Zuverlässigkeit', 'Verpasste Vertragsfahrten senken die Zuverlässigkeit. Zu viele Ausfälle beenden den Vertrag.'],
      ['Liquidität', 'Behalte in den Finanzen Kontostand, Kredite und Monatsergebnis im Blick.'],
    ],
  },
  {
    id: 'special-cargo',
    icon: '❄️',
    title: 'Spezialfracht',
    summary: 'Kühlware, Gefahrgut und Schwerlast zahlen deutlich besser – mit der richtigen Ausrüstung.',
    unlockHint: 'Erreiche Story-Kapitel 3, Ansehen 60 oder besitze Spezialausrüstung.',
    isUnlocked: () => (GS.progress?.chapter || 0) >= 2
      || (GS.company.reputation || 50) >= 60
      || _hasSpecialEquipment(),
    steps: [
      {
        text: 'Beschaffe im Fuhrpark ein Spezialfahrzeug oder einen Spezialanhänger.',
        hint: 'Kühlung, ADR (Gefahrgut) und Schwerlast schalten neue Auftragsarten frei.',
        target: ['#fleet-tab-buy', NAV('fleet')],
        check: _hasSpecialEquipment,
      },
      {
        text: 'Nimm einen Spezialauftrag an (erkennbar an ⚠️ Anforderungen).',
        hint: 'Für Gefahrgut braucht auch der Fahrer ein ADR-Zertifikat.',
        target: [NAV('orders')],
        check: () => GS.orders.active.some(order => (order.requirements || []).length > 0)
          || (GS.progress?.specialDelivered || 0) > 0,
        wait: _specialOrderWaitReason,
      },
    ],
    lessons: [
      ['Investition', 'Spezialtechnik ist teuer. Rechne nach, ob genug passende Aufträge kommen.'],
      ['Qualifikation', 'Fahrzeug, Anhänger und Fahrer müssen gemeinsam alle Anforderungen erfüllen.'],
      ['Ansehen', 'Hohes Ansehen öffnet größere Ladungen und anspruchsvollere Kunden.'],
    ],
  },
  {
    id: 'europe-network',
    icon: '🌍',
    title: 'Europa als Netzwerk',
    summary: 'Profis lassen ihre LKW nicht leer heimfahren, sondern dort weiterarbeiten, wo die Tour endet.',
    unlockHint: 'Schließe zehn Lieferungen ab oder liefere in drei Länder.',
    isUnlocked: () => _completed() >= 10 || (GS.progress?.countries?.length || 0) >= 3,
    steps: [
      {
        text: 'Starte eine Tour, deren letzter Stopp im Ausland liegt – ohne Rückkehr zur Zentrale.',
        hint: 'Lass den Haken bei „Danach zur Zentrale zurückkehren“ weg. Der LKW bleibt am Ziel und kann dort direkt neue Fracht aufnehmen.',
        target: ['.tour-planner-entry', NAV('orders')],
        event: 'tour-dispatched',
        accept: payload => !!payload.endsAbroad,
        wait: getTourWaitReason,
      },
      {
        text: 'Öffne die Karte und verfolge, wo dein LKW die Tour beendet.',
        hint: 'Verteilte Fahrzeuge erreichen mehr Kunden mit weniger Leerkilometern.',
        target: [NAV('map')],
        event: 'screen:map',
      },
    ],
    lessons: [
      ['Endstandort ist Strategie', 'Ein LKW in Wien findet andere Aufträge als einer in Frankfurt.'],
      ['Netz statt Einzelfahrt', 'Je mehr Regionen du abdeckst, desto seltener fährst du leer.'],
      ['Grenzenlos', 'Lieferungen in neue Länder bringen dich in der Kampagne und bei Erfolgen voran.'],
    ],
  },
];

const STATUSES = ['new', 'active', 'paused', 'done'];

function _freshTutorialState() {
  return {
    version: 3,
    status: 'new',
    activeChapter: null,
    stepIndex: 0,
    unlocked: [TUTORIAL_CHAPTERS[0].id],
    completed: [],
    opened: [],
    coachCollapsed: false,
  };
}

function _validIds(ids) {
  const known = new Set(TUTORIAL_CHAPTERS.map(chapter => chapter.id));
  return [...new Set((Array.isArray(ids) ? ids : []).filter(id => known.has(id)))];
}

export function ensureTutorialState() {
  const progress = ensureProgressState();
  const old = progress.tutorial;
  if (!old || typeof old !== 'object') {
    progress.tutorial = _freshTutorialState();
  } else if (old.version !== 3) {
    const fresh = _freshTutorialState();
    if (old.version === 2) {
      fresh.unlocked = old.unlocked;
      fresh.completed = old.completed;
      fresh.opened = old.opened;
      fresh.activeChapter = old.activeChapter;
    } else if (old.status === 'done' || old.status === 'active') {
      fresh.completed = old.status === 'done' ? ['tour-planning'] : [];
    }
    fresh.status = old.status === 'skipped' ? 'paused'
      : old.status === 'new' ? 'new'
      : 'active';
    progress.tutorial = fresh;
  }

  const tutorial = progress.tutorial;
  tutorial.unlocked = _validIds(tutorial.unlocked);
  tutorial.completed = _validIds(tutorial.completed);
  tutorial.opened = _validIds(tutorial.opened);
  if (!tutorial.unlocked.includes(TUTORIAL_CHAPTERS[0].id)) tutorial.unlocked.unshift(TUTORIAL_CHAPTERS[0].id);
  if (!STATUSES.includes(tutorial.status)) tutorial.status = 'new';
  if (!getTutorialChapter(tutorial.activeChapter) || tutorial.completed.includes(tutorial.activeChapter)) {
    tutorial.activeChapter = null;
  }
  if (!Number.isInteger(tutorial.stepIndex) || tutorial.stepIndex < 0) tutorial.stepIndex = 0;
  return tutorial;
}

export function getTutorialChapter(id) {
  return TUTORIAL_CHAPTERS.find(chapter => chapter.id === id) || null;
}

export function unlockTutorialChapters() {
  const tutorial = ensureTutorialState();
  const newlyUnlocked = [];
  for (const chapter of TUTORIAL_CHAPTERS) {
    if (!tutorial.unlocked.includes(chapter.id) && chapter.isUnlocked()) {
      tutorial.unlocked.push(chapter.id);
      newlyUnlocked.push(chapter);
    }
  }
  return newlyUnlocked;
}

export function getTutorialOverview() {
  const tutorial = ensureTutorialState();
  return TUTORIAL_CHAPTERS.map((chapter, index) => ({
    ...chapter,
    index,
    unlocked: tutorial.unlocked.includes(chapter.id),
    completed: tutorial.completed.includes(chapter.id),
    active: tutorial.activeChapter === chapter.id,
    isNew: tutorial.unlocked.includes(chapter.id) && !tutorial.opened.includes(chapter.id),
  }));
}

export function markTutorialChaptersOpened(ids = null) {
  const tutorial = ensureTutorialState();
  const toOpen = ids === null ? tutorial.unlocked : _validIds(ids);
  tutorial.opened = _validIds([...tutorial.opened, ...toOpen]);
  return tutorial;
}

/** The earliest unlocked chapter that has not been completed yet. */
export function getNextTutorialChapter() {
  const tutorial = ensureTutorialState();
  return TUTORIAL_CHAPTERS.find(chapter =>
    tutorial.unlocked.includes(chapter.id) && !tutorial.completed.includes(chapter.id)
  ) || null;
}

/** The first chapter that is still locked (used as a teaser). */
export function getNextLockedTutorialChapter() {
  const tutorial = ensureTutorialState();
  return TUTORIAL_CHAPTERS.find(chapter => !tutorial.unlocked.includes(chapter.id)) || null;
}

export function getActiveTutorialChapter() {
  return getTutorialChapter(ensureTutorialState().activeChapter);
}

/** Returns the current step of the active chapter including why it may be blocked. */
export function getActiveTutorialStep() {
  const tutorial = ensureTutorialState();
  const chapter = getActiveTutorialChapter();
  if (!chapter) return null;
  const index = Math.min(tutorial.stepIndex, chapter.steps.length - 1);
  const step = chapter.steps[index];
  return {
    chapter,
    chapterIndex: TUTORIAL_CHAPTERS.indexOf(chapter),
    step,
    index,
    total: chapter.steps.length,
    waitReason: step.wait ? step.wait() : null,
  };
}

export function startTutorialChapter(chapterId) {
  const tutorial = ensureTutorialState();
  const chapter = getTutorialChapter(chapterId);
  if (!chapter) return null;
  if (!tutorial.unlocked.includes(chapterId)) tutorial.unlocked.push(chapterId);
  tutorial.completed = tutorial.completed.filter(id => id !== chapterId);
  tutorial.status = 'active';
  tutorial.activeChapter = chapterId;
  tutorial.stepIndex = 0;
  if (!tutorial.opened.includes(chapterId)) tutorial.opened.push(chapterId);
  return chapter;
}

export function completeTutorialChapter(chapterId) {
  const tutorial = ensureTutorialState();
  const chapter = getTutorialChapter(chapterId);
  if (!chapter) return null;
  if (!tutorial.completed.includes(chapterId)) tutorial.completed.push(chapterId);
  if (tutorial.activeChapter === chapterId) {
    tutorial.activeChapter = null;
    tutorial.stepIndex = 0;
  }
  if (tutorial.completed.length >= TUTORIAL_CHAPTERS.length) tutorial.status = 'done';
  return chapter;
}

function _stepDone(step, event) {
  if (step.check && step.check()) return true;
  if (!event || !step.event || step.event !== event.action) return false;
  return !step.accept || step.accept(event);
}

/**
 * Evaluates the active chapter against the current game state and an optional
 * tutorial event. Steps are completed in order; an event can complete at most
 * one step so a single click never skips ahead.
 * @returns {{advanced:number, completed: object|null, prepared: object[]}}
 */
export function advanceTutorial(event = null) {
  const tutorial = ensureTutorialState();
  const chapter = getActiveTutorialChapter();
  if (tutorial.status !== 'active' || !chapter) return { advanced: 0, completed: null, prepared: [] };

  const prepared = chapter.prepare ? chapter.prepare() : [];
  let advanced = 0;
  let pendingEvent = event;
  while (tutorial.stepIndex < chapter.steps.length) {
    const step = chapter.steps[tutorial.stepIndex];
    if (!_stepDone(step, pendingEvent)) break;
    if (pendingEvent && step.event === pendingEvent.action) pendingEvent = null;
    tutorial.stepIndex++;
    advanced++;
  }
  if (tutorial.stepIndex >= chapter.steps.length) {
    return { advanced, completed: completeTutorialChapter(chapter.id), prepared };
  }
  return { advanced, completed: null, prepared };
}

/** Manually skips the current step (safety valve for stuck players). */
export function skipTutorialStep() {
  const tutorial = ensureTutorialState();
  const chapter = getActiveTutorialChapter();
  if (!chapter) return { advanced: 0, completed: null };
  tutorial.stepIndex++;
  if (tutorial.stepIndex >= chapter.steps.length) {
    return { advanced: 1, completed: completeTutorialChapter(chapter.id) };
  }
  return { advanced: 1, completed: null };
}

export function pauseTutorial() {
  const tutorial = ensureTutorialState();
  tutorial.status = 'paused';
  return tutorial;
}

export function resumeTutorial() {
  const tutorial = ensureTutorialState();
  tutorial.status = tutorial.completed.length >= TUTORIAL_CHAPTERS.length ? 'done' : 'active';
  return tutorial;
}

export function shouldOfferTutorial() {
  return ensureTutorialState().status === 'new';
}
