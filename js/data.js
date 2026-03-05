'use strict';

// ============================================================
// STATIC GAME DATA
// ============================================================

const DATA = {

  // ── Vehicle catalogue ───────────────────────────────────
  VEHICLES: [
    {
      id: 'transit',
      name: 'Kleintransporter',
      model: 'Ford Transit',
      type: 'van',
      capacity: 2000,
      fuelCapacity: 70,
      fuelConsumption: 10,   // L / 100 km
      speed: 90,             // avg km/h
      purchasePrice: 28000,
      maintenanceCostPerMonth: 150,
      description: 'Ideal für Kurzstrecken und Paketzustellungen.',
      requirements: [],
      icon: '🚐'
    },
    {
      id: 'truck_small',
      name: 'Leichter LKW',
      model: 'MAN TGL 8',
      type: 'truck',
      capacity: 7500,
      fuelCapacity: 150,
      fuelConsumption: 18,
      speed: 80,
      purchasePrice: 65000,
      maintenanceCostPerMonth: 350,
      description: 'Vielseitig einsetzbar für Paletten- und Stückgut.',
      requirements: [],
      icon: '🚛'
    },
    {
      id: 'truck_medium',
      name: 'Mittelschwerer LKW',
      model: 'Mercedes Actros 18t',
      type: 'truck',
      capacity: 18000,
      fuelCapacity: 300,
      fuelConsumption: 25,
      speed: 80,
      purchasePrice: 120000,
      maintenanceCostPerMonth: 600,
      description: 'Für mittelschwere Ladungen und Regionalverkehr.',
      requirements: [],
      icon: '🚛'
    },
    {
      id: 'semi',
      name: 'Sattelzug',
      model: 'Volvo FH 500',
      type: 'semi',
      capacity: 24000,
      fuelCapacity: 500,
      fuelConsumption: 30,
      speed: 85,
      purchasePrice: 185000,
      maintenanceCostPerMonth: 900,
      description: 'Maximale Nutzlast für Fernstrecken quer durch Europa.',
      requirements: [],
      icon: '🚚'
    },
    {
      id: 'reefer',
      name: 'Kühllaster',
      model: 'Scania R 450 Thermo',
      type: 'semi',
      capacity: 22000,
      fuelCapacity: 500,
      fuelConsumption: 34,
      speed: 80,
      purchasePrice: 210000,
      maintenanceCostPerMonth: 1100,
      description: 'Kühlauflieger für temperaturempfindliche Waren.',
      requirements: ['cooling'],
      icon: '🧊'
    },
    {
      id: 'tanker',
      name: 'Tankzug',
      model: 'MAN TGX Tankauflieger',
      type: 'semi',
      capacity: 30000,
      fuelCapacity: 600,
      fuelConsumption: 32,
      speed: 75,
      purchasePrice: 230000,
      maintenanceCostPerMonth: 1200,
      description: 'Für Flüssigkeiten, Treibstoffe und Chemikalien.',
      requirements: ['adr'],
      icon: '🛢️'
    },
    {
      id: 'hazmat',
      name: 'Gefahrgut-LKW',
      model: 'DAF XF ADR',
      type: 'truck',
      capacity: 20000,
      fuelCapacity: 400,
      fuelConsumption: 28,
      speed: 75,
      purchasePrice: 195000,
      maintenanceCostPerMonth: 1000,
      description: 'Zugelassen für Gefahrguttransporte nach ADR.',
      requirements: ['adr'],
      icon: '☢️'
    },
    {
      id: 'heavy',
      name: 'Schwerlastzug',
      model: 'Liebherr Schwertransport',
      type: 'special',
      capacity: 60000,
      fuelCapacity: 800,
      fuelConsumption: 50,
      speed: 50,
      purchasePrice: 480000,
      maintenanceCostPerMonth: 2500,
      description: 'Für Industriekomponenten und Schwertransporte.',
      requirements: ['heavy_load'],
      icon: '🏗️'
    }
  ],

  // ── Fictional clients ───────────────────────────────────
  CLIENTS: [
    { id: 'c01', name: 'Müller Lebensmittel GmbH',         industry: 'food',       preferredCargo: ['food','cooling'],   city: 'frankfurt' },
    { id: 'c02', name: 'Rhein-Baustoffe AG',               industry: 'building',   preferredCargo: ['building'],         city: 'koeln' },
    { id: 'c03', name: 'Chemie Nord GmbH',                 industry: 'hazmat',     preferredCargo: ['hazmat','liquid'],  city: 'hamburg' },
    { id: 'c04', name: 'AutoLogistik Süd',                 industry: 'auto',       preferredCargo: ['general'],          city: 'muenchen' },
    { id: 'c05', name: 'Frische Felder AG',                industry: 'food',       preferredCargo: ['food','cooling'],   city: 'hannover' },
    { id: 'c06', name: 'Energie West GmbH',                industry: 'fuel',       preferredCargo: ['fuel'],             city: 'duesseldorf' },
    { id: 'c07', name: 'Technik-Versand Berlin',           industry: 'tech',       preferredCargo: ['general'],          city: 'berlin' },
    { id: 'c08', name: 'Stahl Mitteldeutschland',          industry: 'building',   preferredCargo: ['building','heavy'], city: 'dresden' },
    { id: 'c09', name: 'Getränke Express Köln',            industry: 'food',       preferredCargo: ['food'],             city: 'koeln' },
    { id: 'c10', name: 'MediLogistik GmbH',                industry: 'medical',    preferredCargo: ['general','cooling'], city: 'stuttgart' },
    { id: 'c11', name: 'Pharma Nord AG',                   industry: 'medical',    preferredCargo: ['cooling'],          city: 'hamburg' },
    { id: 'c12', name: 'Kunststoff Technik Essen',         industry: 'industrial', preferredCargo: ['general'],          city: 'essen' },
    { id: 'c13', name: 'Papier Zentrum Leipzig',           industry: 'paper',      preferredCargo: ['general'],          city: 'leipzig' },
    { id: 'c14', name: 'Möbel Direkt GmbH',               industry: 'furniture',  preferredCargo: ['general'],          city: 'bielefeld' },
    { id: 'c15', name: 'Baierische Milchwirtschaft',       industry: 'food',       preferredCargo: ['food','cooling'],   city: 'muenchen' },
    { id: 'c16', name: 'Trans-Oil Raffinerie AG',          industry: 'fuel',       preferredCargo: ['fuel'],             city: 'hamburg' },
    { id: 'c17', name: 'Elektronik Großhandel Nord',       industry: 'tech',       preferredCargo: ['general'],          city: 'bremen' },
    { id: 'c18', name: 'Landwirt Kooperative Süd',         industry: 'food',       preferredCargo: ['food','building'],  city: 'nuernberg' },
    { id: 'c19', name: 'Werkzeug Fabrik Remscheid',        industry: 'industrial', preferredCargo: ['general'],          city: 'dortmund' },
    { id: 'c20', name: 'Tiefkühlkost Rheinland',          industry: 'food',       preferredCargo: ['cooling'],          city: 'bonn' },
    { id: 'c21', name: 'Logistik Partner Wien',            industry: 'general',    preferredCargo: ['general'],          city: 'wien' },
    { id: 'c22', name: 'Bergmann Chemie GmbH',             industry: 'hazmat',     preferredCargo: ['hazmat'],           city: 'frankfurt' },
    { id: 'c23', name: 'Holzwerk Schwarzwald',             industry: 'building',   preferredCargo: ['building'],         city: 'karlsruhe' },
    { id: 'c24', name: 'Textil Import Frankfurt',          industry: 'fashion',    preferredCargo: ['general'],          city: 'frankfurt' },
    { id: 'c25', name: 'SportGear Distribution',           industry: 'sports',     preferredCargo: ['general'],          city: 'muenchen' },
  ],

  // ── European cities (canvas coords on 800×520 map) ─────
  // lon -10→30 → x = (lon+10)/40*800   lat 35→65 → y = (65-lat)/30*520
  CITIES: [
    // Germany
    { id: 'hamburg',     name: 'Hamburg',      x: 400, y: 191, country: 'DE', hub: true  },
    { id: 'berlin',      name: 'Berlin',       x: 468, y: 207, country: 'DE', hub: true  },
    { id: 'muenchen',    name: 'München',      x: 432, y: 281, country: 'DE', hub: true  },
    { id: 'koeln',       name: 'Köln',         x: 339, y: 235, country: 'DE', hub: true  },
    { id: 'bonn',        name: 'Bonn',         x: 342, y: 238, country: 'DE', hub: false },
    { id: 'frankfurt',   name: 'Frankfurt',    x: 374, y: 248, country: 'DE', hub: true  },
    { id: 'stuttgart',   name: 'Stuttgart',    x: 365, y: 270, country: 'DE', hub: false },
    { id: 'dortmund',    name: 'Dortmund',     x: 349, y: 224, country: 'DE', hub: false },
    { id: 'duesseldorf', name: 'Düsseldorf',   x: 335, y: 229, country: 'DE', hub: false },
    { id: 'bremen',      name: 'Bremen',       x: 376, y: 198, country: 'DE', hub: false },
    { id: 'hannover',    name: 'Hannover',     x: 395, y: 211, country: 'DE', hub: false },
    { id: 'dresden',     name: 'Dresden',      x: 475, y: 232, country: 'DE', hub: false },
    { id: 'leipzig',     name: 'Leipzig',      x: 448, y: 227, country: 'DE', hub: false },
    { id: 'nuernberg',   name: 'Nürnberg',     x: 421, y: 259, country: 'DE', hub: false },
    { id: 'karlsruhe',   name: 'Karlsruhe',    x: 368, y: 266, country: 'DE', hub: false },
    { id: 'bielefeld',   name: 'Bielefeld',    x: 365, y: 218, country: 'DE', hub: false },
    { id: 'essen',       name: 'Essen',        x: 340, y: 225, country: 'DE', hub: false },
    { id: 'mannheim',    name: 'Mannheim',     x: 369, y: 258, country: 'DE', hub: false },
    { id: 'rostock',     name: 'Rostock',      x: 443, y: 182, country: 'DE', hub: false },
    { id: 'kiel',        name: 'Kiel',         x: 403, y: 178, country: 'DE', hub: false },
    // Neighbours
    { id: 'amsterdam',   name: 'Amsterdam',    x: 298, y: 211, country: 'NL', hub: true  },
    { id: 'bruessel',    name: 'Brüssel',      x: 287, y: 236, country: 'BE', hub: false },
    { id: 'paris',       name: 'Paris',        x: 247, y: 269, country: 'FR', hub: true  },
    { id: 'lyon',        name: 'Lyon',         x: 297, y: 322, country: 'FR', hub: false },
    { id: 'marseille',   name: 'Marseille',    x: 307, y: 362, country: 'FR', hub: false },
    { id: 'zuerich',     name: 'Zürich',       x: 371, y: 294, country: 'CH', hub: false },
    { id: 'bern',        name: 'Bern',         x: 358, y: 298, country: 'CH', hub: false },
    { id: 'wien',        name: 'Wien',         x: 527, y: 280, country: 'AT', hub: true  },
    { id: 'prag',        name: 'Prag',         x: 489, y: 249, country: 'CZ', hub: false },
    { id: 'warschau',    name: 'Warschau',     x: 620, y: 213, country: 'PL', hub: true  },
    { id: 'budapest',    name: 'Budapest',     x: 581, y: 292, country: 'HU', hub: false },
    { id: 'kopenhagen',  name: 'Kopenhagen',   x: 451, y: 155, country: 'DK', hub: false },
    { id: 'stockholm',   name: 'Stockholm',    x: 561, y: 94,  country: 'SE', hub: false },
    { id: 'oslo',        name: 'Oslo',         x: 415, y: 68,  country: 'NO', hub: false },
    { id: 'rom',         name: 'Rom',          x: 450, y: 385, country: 'IT', hub: true  },
    { id: 'mailand',     name: 'Mailand',      x: 384, y: 326, country: 'IT', hub: false },
    { id: 'barcelona',   name: 'Barcelona',    x: 243, y: 394, country: 'ES', hub: false },
    { id: 'madrid',      name: 'Madrid',       x: 126, y: 410, country: 'ES', hub: false },
    { id: 'lissabon',    name: 'Lissabon',     x: 17,  y: 438, country: 'PT', hub: false },
    { id: 'athen',       name: 'Athen',        x: 574, y: 445, country: 'GR', hub: false },
    { id: 'bratislava',  name: 'Bratislava',   x: 547, y: 278, country: 'SK', hub: false },
    { id: 'zagreb',      name: 'Zagreb',       x: 513, y: 313, country: 'HR', hub: false },
    { id: 'helsinki',    name: 'Helsinki',     x: 625, y: 80,  country: 'FI', hub: false },
  ],

  // ── Cargo types ─────────────────────────────────────────
  CARGO_TYPES: [
    { id: 'general',   label: 'Allgemeingut',     icon: '📦', requiresVehicle: [] },
    { id: 'food',      label: 'Lebensmittel',     icon: '🥗', requiresVehicle: [] },
    { id: 'cooling',   label: 'Kühlware',         icon: '🧊', requiresVehicle: ['cooling'] },
    { id: 'building',  label: 'Baustoffe',        icon: '🏗️', requiresVehicle: [] },
    { id: 'hazmat',    label: 'Gefahrgut',        icon: '☢️', requiresVehicle: ['adr'] },
    { id: 'fuel',      label: 'Kraftstoff',       icon: '⛽', requiresVehicle: ['adr'] },
    { id: 'liquid',    label: 'Flüssigkeiten',    icon: '🛢️', requiresVehicle: [] },
    { id: 'heavy',     label: 'Schwerlast',       icon: '⚓', requiresVehicle: ['heavy_load'] },
    { id: 'medical',   label: 'Medizingüter',     icon: '💊', requiresVehicle: [] },
    { id: 'auto',      label: 'Fahrzeugteile',    icon: '🔧', requiresVehicle: [] },
  ],

  // ── Staff roles ─────────────────────────────────────────
  STAFF_ROLES: {
    driver: {
      label: 'LKW-Fahrer',
      icon: '🚛',
      baseSalary: 2400,
      description: 'Führt Transporte durch. Benötigt Führerschein CE.',
    },
    mechanic: {
      label: 'Mechaniker',
      icon: '🔧',
      baseSalary: 2600,
      description: 'Repariert und wartet Fahrzeuge. Senkt Reparaturkosten.',
    },
    accountant: {
      label: 'Buchhalterin',
      icon: '📊',
      baseSalary: 3200,
      description: 'Erstellt Bilanzen, senkt Steuerlast.',
    },
    operator: {
      label: 'Telefonistin',
      icon: '📞',
      baseSalary: 2200,
      description: 'Leitet Kundenanfragen weiter. Erhöht Auftragseingang.',
    },
    manager: {
      label: 'Manager',
      icon: '👔',
      baseSalary: 5000,
      description: 'Übernimmt Verwaltungsaufgaben. Erhöht Effizienz.',
    },
    lawyer: {
      label: 'Rechtsanwältin',
      icon: '⚖️',
      baseSalary: 4500,
      description: 'Unterstützt bei Vertragsverhandlungen. Reduziert Strafen.',
    }
  },

  // ── German first & last names ────────────────────────────
  FIRST_NAMES_M: ['Hans','Klaus','Werner','Dieter','Franz','Otto','Günter','Helmut','Karl','Gerhard','Thomas','Michael','Stefan','Andreas','Jürgen','Wolfgang','Uwe','Peter','Rolf','Manfred'],
  FIRST_NAMES_F: ['Ursula','Ingrid','Monika','Petra','Helga','Gisela','Renate','Hildegard','Erika','Anna','Maria','Sandra','Claudia','Sabine','Karin','Brigitte','Ute','Christine','Angela','Stefanie'],
  LAST_NAMES: ['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann','Braun','Koch','Richter','Klein','Wolf','Schäfer','Bauer','Zimmermann','Krause','Lange','Krüger','Hartmann','Lehmann','Schwarz','Schmitt'],

  // ── Market events ────────────────────────────────────────
  MARKET_EVENTS: [
    {
      id: 'fuel_rise',
      title: 'Kraftstoffpreise steigen',
      description: 'Aufgrund globaler Lieferengpässe steigen die Dieselpreise.',
      effect: { fuelPriceMod: +0.30, duration: 14 },
      probability: 0.08
    },
    {
      id: 'fuel_drop',
      title: 'Kraftstoffpreise sinken',
      description: 'Gute Nachrichten: Der Ölpreis fällt. Kraftstoff wird günstiger.',
      effect: { fuelPriceMod: -0.20, duration: 10 },
      probability: 0.06
    },
    {
      id: 'strike',
      title: 'Streik im Transportsektor',
      description: 'Gewerkschaft ruft zum Streik auf. Weniger Konkurrenz, aber auch weniger Fahrer.',
      effect: { orderValueMod: +0.15, driverStrikeChance: 0.2, duration: 5 },
      probability: 0.04
    },
    {
      id: 'recession',
      title: 'Wirtschaftliche Abschwächung',
      description: 'Schwache Konjunktur drückt Auftragsvolumen und Preise.',
      effect: { orderVolumeMod: -0.30, orderValueMod: -0.20, duration: 30 },
      probability: 0.03
    },
    {
      id: 'boom',
      title: 'Wirtschaftsboom',
      description: 'Hohe Nachfrage: Auftragsvolumen und Preise steigen.',
      effect: { orderVolumeMod: +0.25, orderValueMod: +0.15, duration: 20 },
      probability: 0.04
    },
    {
      id: 'winter',
      title: 'Wintersturm',
      description: 'Schnee und Glatteis verlangsamen den Verkehr.',
      effect: { speedMod: -0.20, fuelConsumptionMod: +0.15, duration: 4 },
      probability: 0.10
    },
    {
      id: 'autobahn_closed',
      title: 'Autobahnsperre',
      description: 'Wegen eines Unfalls ist die A3 zwischen Frankfurt und Köln gesperrt.',
      effect: { speedMod: -0.10, duration: 2 },
      probability: 0.12
    },
    {
      id: 'new_regulation',
      title: 'Neue Umweltregulierung',
      description: 'Die EU verschärft Emissionsvorschriften. Ältere Fahrzeuge kosten mehr.',
      effect: { oldVehicleTaxMod: +0.05, duration: 60 },
      probability: 0.02
    }
  ],

  // ── Difficulty presets ───────────────────────────────────
  DIFFICULTY: {
    leicht: {
      label: 'Leicht',
      startMoney: 100000,
      orderPenaltyMod: 0.5,
      fuelPriceBase: 1.45,
      orderFrequency: 1.5,
      competitorActivity: 0.3,
      eventProbabilityMod: 0.5
    },
    normal: {
      label: 'Normal',
      startMoney: 50000,
      orderPenaltyMod: 1.0,
      fuelPriceBase: 1.65,
      orderFrequency: 1.0,
      competitorActivity: 0.7,
      eventProbabilityMod: 1.0
    },
    schwer: {
      label: 'Schwer',
      startMoney: 25000,
      orderPenaltyMod: 1.5,
      fuelPriceBase: 1.85,
      orderFrequency: 0.75,
      competitorActivity: 1.0,
      eventProbabilityMod: 1.5
    }
  },

  // ── Press-conference answers ─────────────────────────────
  PRESS_CONFERENCE: [
    {
      situation: 'accident',
      question: 'Einer Ihrer Fahrer hatte einen Unfall. Wie reagieren Sie?',
      options: [
        { text: 'Wir bedauern den Vorfall aufrichtig und kümmern uns um alle Betroffenen.', reputationMod: +5 },
        { text: 'Unser Fahrer trägt keine Schuld. Das war ein technisches Versagen.', reputationMod: -3 },
        { text: 'Kein Kommentar. Unser Rechtsteam klärt alles.', reputationMod: -8 }
      ]
    },
    {
      situation: 'delay',
      question: 'Mehrere Lieferungen waren verspätet. Was sagen Sie dazu?',
      options: [
        { text: 'Wir haben in neue Routenplanung investiert, das wird sich nicht wiederholen.', reputationMod: +8 },
        { text: 'Externe Faktoren wie Wetter haben uns leider behindert.', reputationMod: +2 },
        { text: 'Wir arbeiten daran.', reputationMod: -2 }
      ]
    },
    {
      situation: 'growth',
      question: 'Ihr Unternehmen wächst stark. Wohin geht die Reise?',
      options: [
        { text: 'Wir setzen auf Nachhaltigkeit und Elektro-LKWs.', reputationMod: +10 },
        { text: 'Wir werden europaweit expandieren.', reputationMod: +6 },
        { text: 'Profit kommt zuerst – das erwartet unsere Investoren.', reputationMod: -5 }
      ]
    }
  ],

  // ── Order cargo templates ────────────────────────────────
  ORDER_TEMPLATES: [
    { cargo: 'Frischobst (Paletten)',        type: 'food',     minWeight: 2000,  maxWeight: 8000,  baseValue: 900,  requirements: [] },
    { cargo: 'Tiefkühlware (Gefriergut)',     type: 'cooling',  minWeight: 3000,  maxWeight: 12000, baseValue: 1500, requirements: ['cooling'] },
    { cargo: 'Baustahl (Coils)',              type: 'building', minWeight: 8000,  maxWeight: 24000, baseValue: 1200, requirements: [] },
    { cargo: 'Zement (Bigbags)',              type: 'building', minWeight: 10000, maxWeight: 22000, baseValue: 1000, requirements: [] },
    { cargo: 'Diesel (Tankladung)',           type: 'fuel',     minWeight: 20000, maxWeight: 30000, baseValue: 2200, requirements: ['adr'] },
    { cargo: 'Chemikalien (Fässer)',          type: 'hazmat',   minWeight: 5000,  maxWeight: 18000, baseValue: 1800, requirements: ['adr'] },
    { cargo: 'Stückgut (gemischt)',           type: 'general',  minWeight: 1000,  maxWeight: 5000,  baseValue: 700,  requirements: [] },
    { cargo: 'Pharmazeutika (Paletten)',      type: 'medical',  minWeight: 500,   maxWeight: 3000,  baseValue: 2000, requirements: [] },
    { cargo: 'Elektronik (Kartons)',          type: 'general',  minWeight: 800,   maxWeight: 4000,  baseValue: 1100, requirements: [] },
    { cargo: 'Haushaltsgeräte (Stückgut)',    type: 'general',  minWeight: 2000,  maxWeight: 10000, baseValue: 950,  requirements: [] },
    { cargo: 'Papier (Rollen)',              type: 'general',  minWeight: 5000,  maxWeight: 22000, baseValue: 850,  requirements: [] },
    { cargo: 'Möbel (Teilladung)',            type: 'general',  minWeight: 1500,  maxWeight: 8000,  baseValue: 1050, requirements: [] },
    { cargo: 'Mineralwasser (Paletten)',      type: 'food',     minWeight: 4000,  maxWeight: 18000, baseValue: 780,  requirements: [] },
    { cargo: 'Fahrzeugteile (Kartons)',       type: 'auto',     minWeight: 2000,  maxWeight: 8000,  baseValue: 1300, requirements: [] },
    { cargo: 'Maschinenbauteile',            type: 'heavy',    minWeight: 5000,  maxWeight: 20000, baseValue: 1600, requirements: [] },
  ],

  // ── City connections (for route distance lookup) ─────────
  // Approximate road distances in km between connected cities
  CONNECTIONS: [
    ['hamburg',    'berlin',      286],
    ['hamburg',    'bremen',       120],
    ['hamburg',    'hannover',     151],
    ['hamburg',    'kiel',         90],
    ['hamburg',    'rostock',     220],
    ['hamburg',    'kopenhagen',  350],
    ['berlin',     'hannover',    248],
    ['berlin',     'dresden',     193],
    ['berlin',     'leipzig',     187],
    ['berlin',     'prag',        350],
    ['berlin',     'warschau',    576],
    ['berlin',     'rostock',     231],
    ['hannover',   'dortmund',    200],
    ['hannover',   'bremen',       120],
    ['hannover',   'bielefeld',   100],
    ['hannover',   'frankfurt',   350],
    ['dortmund',   'koeln',       75],
    ['dortmund',   'essen',       30],
    ['dortmund',   'duesseldorf', 60],
    ['dortmund',   'bielefeld',   95],
    ['koeln',      'bonn',        28],
    ['koeln',      'frankfurt',   190],
    ['koeln',      'duesseldorf', 45],
    ['koeln',      'bruessel',    215],
    ['koeln',      'amsterdam',   230],
    ['frankfurt',  'nuernberg',   222],
    ['frankfurt',  'stuttgart',   200],
    ['frankfurt',  'mannheim',     77],
    ['frankfurt',  'karlsruhe',   130],
    ['frankfurt',  'prag',        380],
    ['frankfurt',  'wien',        720],
    ['stuttgart',  'muenchen',    218],
    ['stuttgart',  'karlsruhe',   81],
    ['stuttgart',  'zuerich',     200],
    ['muenchen',   'nuernberg',   170],
    ['muenchen',   'wien',        450],
    ['muenchen',   'zuerich',     320],
    ['muenchen',   'innsbruck',   153],
    ['nuernberg',  'dresden',     295],
    ['nuernberg',  'leipzig',     260],
    ['dresden',    'prag',        148],
    ['prag',       'wien',        330],
    ['prag',       'bratislava',  330],
    ['wien',       'budapest',    243],
    ['wien',       'bratislava',   60],
    ['wien',       'zagreb',      370],
    ['budapest',   'zagreb',      360],
    ['amsterdam',  'bruessel',    204],
    ['amsterdam',  'paris',       500],
    ['bruessel',   'paris',       304],
    ['paris',      'lyon',        465],
    ['paris',      'barcelona',   1040],
    ['paris',      'madrid',      1270],
    ['lyon',       'marseille',   315],
    ['lyon',       'mailand',     300],
    ['lyon',       'bern',        270],
    ['marseille',  'barcelona',   490],
    ['marseille',  'mailand',     460],
    ['bern',       'zuerich',      130],
    ['mailand',    'zuerich',     280],
    ['mailand',    'rom',         570],
    ['madrid',     'barcelona',   620],
    ['madrid',     'lissabon',    627],
    ['kopenhagen', 'stockholm',   660],
    ['oslo',       'stockholm',   520],
    ['oslo',       'kopenhagen',  580],
    ['stockholm',  'helsinki',    900],
    ['warschau',   'prag',        690],
    ['warschau',   'bratislava',  620],
    ['zagreb',     'bratislava',  370],
    ['athen',      'budapest',    1400],
  ]
};
