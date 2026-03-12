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
    model: 'Ford Transit 350 L2H2',
    type: 'van',
    capacity: 1800,
    fuelCapacity: 80,
    fuelConsumption: 11,
    speed: 130,
    purchasePrice: 38000,
    maintenanceCostPerMonth: 180,
    description: 'Ideal für Kurzstrecken, Pakete und Stückgut bis 3,5 t.',
    requirements: [],
    icon: '🚐'
  },
  {
    id: 'sprinter',
    name: 'Großer Transporter',
    model: 'Mercedes-Benz Sprinter 519 CDI',
    type: 'van',
    capacity: 2500,
    fuelCapacity: 93,
    fuelConsumption: 11,
    speed: 130,
    purchasePrice: 52000,
    maintenanceCostPerMonth: 250,
    description: 'Schwerer Transporter bis 5 t – die Brücke zwischen Van und LKW.',
    requirements: [],
    icon: '🚐'
  },
  {
    id: 'truck_small',
    name: 'Leichter LKW',
    model: 'MAN TGL 8.220',
    type: 'truck',
    capacity: 4500,
    fuelCapacity: 120,
    fuelConsumption: 15,
    speed: 80,
    purchasePrice: 75000,
    maintenanceCostPerMonth: 400,
    description: 'Vielseitig einsetzbar für Paletten- und Stückgut bis 7,5 t.',
    requirements: [],
    icon: '🚛'
  },
  {
    id: 'truck_medium',
    name: 'Mittelschwerer LKW',
    model: 'Mercedes-Benz Actros 1824',
    type: 'truck',
    capacity: 10000,
    fuelCapacity: 200,
    fuelConsumption: 22,
    speed: 80,
    purchasePrice: 135000,
    maintenanceCostPerMonth: 700,
    description: 'Für mittelschwere Ladungen und Regionalverkehr bis 18 t.',
    requirements: [],
    icon: '🚛'
  },
  {
    id: 'truck_large',
    name: 'Schwerer LKW',
    model: 'DAF CF 340 FAR',
    type: 'truck',
    capacity: 14000,
    fuelCapacity: 300,
    fuelConsumption: 24,
    speed: 80,
    purchasePrice: 105000,
    maintenanceCostPerMonth: 550,
    description: 'Schwerer Solofahrer für Distributions- und Regionalverkehr bis 26 t.',
    requirements: [],
    icon: '🚛'
  },
  {
    id: 'gliederzug',
    name: 'Wechselbrücken-Gliederzug',
    model: 'MAN TGX 26.470 + Krone WB',
    type: 'truck',
    capacity: 20000,
    fuelCapacity: 600,
    fuelConsumption: 30,
    speed: 80,
    purchasePrice: 165000,
    maintenanceCostPerMonth: 850,
    description: 'Klassischer Gliederzug für Paketdienste und Sammelgut mit schnellem Wechselbrücken-Umschlag.',
    requirements: [],
    icon: '🚚'
  },
  {
    id: 'tipper',
    name: 'Kipper-LKW',
    model: 'Scania R 450 XT Dreiseitenkipper',
    type: 'truck',
    capacity: 16000,
    fuelCapacity: 400,
    fuelConsumption: 28,
    speed: 75,
    purchasePrice: 175000,
    maintenanceCostPerMonth: 950,
    description: 'Dreiseitenkipper für Schüttgut, Sand, Kies und Bauabfälle.',
    requirements: ['bulk_goods'],
    icon: '🏗️'
  },
  {
    id: 'crane_truck',
    name: 'LKW mit Ladekran',
    model: 'Mercedes-Benz Arocs 2548 + Palfinger PK 65002',
    type: 'truck',
    capacity: 12000,
    fuelCapacity: 300,
    fuelConsumption: 26,
    speed: 75,
    purchasePrice: 195000,
    maintenanceCostPerMonth: 1100,
    description: 'LKW mit Knickarmkran für be- und entladungsunabhängige Lieferungen auf Baustellen.',
    requirements: ['crane_delivery'],
    icon: '🦺'
  },
  {
    id: 'semi',
    name: 'Sattelzug (Plane)',
    model: 'Volvo FH 500',
    type: 'semi',
    capacity: 24000,
    fuelCapacity: 810,
    fuelConsumption: 29,
    speed: 85,
    purchasePrice: 195000,
    maintenanceCostPerMonth: 950,
    description: 'Standard-Gardinensattelzug für Fernstrecken quer durch Europa.',
    requirements: [],
    trailerSlot: true,
    icon: '🚚'
  },
  {
    id: 'reefer',
    name: 'Kühllaster',
    model: 'Scania R 450 + Kühlauflieger',
    type: 'semi',
    capacity: 22000,
    fuelCapacity: 800,
    fuelConsumption: 32,
    speed: 80,
    purchasePrice: 225000,
    maintenanceCostPerMonth: 1200,
    description: 'Kühlauflieger für temperaturempfindliche Waren (0–8 °C / TK).',
    requirements: ['cooling'],
    trailerSlot: true,
    icon: '🧊'
  },
  {
    id: 'tanker',
    name: 'Tankzug',
    model: 'MAN TGX 26.470 + Tankauflieger',
    type: 'semi',
    capacity: 28000,
    fuelCapacity: 600,
    fuelConsumption: 31,
    speed: 75,
    purchasePrice: 245000,
    maintenanceCostPerMonth: 1300,
    description: 'Für Flüssigkeiten, Treibstoffe und Chemikalien (ADR-zertifiziert).',
    requirements: ['adr'],
    trailerSlot: true,
    icon: '🛢️'
  },
  {
    id: 'hazmat',
    name: 'Gefahrgut-LKW',
    model: 'DAF XF 480 ADR',
    type: 'truck',
    capacity: 18000,
    fuelCapacity: 400,
    fuelConsumption: 27,
    speed: 75,
    purchasePrice: 210000,
    maintenanceCostPerMonth: 1100,
    description: 'Zugelassen für alle ADR-Klassen – Gefahrguttransporte europaweit.',
    requirements: ['adr'],
    icon: '☢️'
  },
  {
    id: 'car_transporter',
    name: 'Autotransporter',
    model: 'Lohr Eurolohr 2 + Zugmaschine',
    type: 'special',
    capacity: 9,              // Einheit: Anzahl PKW
    fuelCapacity: 700,
    fuelConsumption: 36,
    speed: 70,
    purchasePrice: 320000,
    maintenanceCostPerMonth: 1600,
    description: 'Doppelstock-Autotransporter für bis zu 9 PKW – exklusiv für Fahrzeugtransport-Aufträge.',
    requirements: ['car_transport'],
    icon: '🚗'
  },
  {
    id: 'heavy',
    name: 'Schwerlastzug',
    model: 'Goldhofer STZ-VL 4-52/80 A F2',
    type: 'special',
    capacity: 60000,
    fuelCapacity: 1000,
    fuelConsumption: 55,
    speed: 40,
    purchasePrice: 520000,
    maintenanceCostPerMonth: 2800,
    description: 'Für Industriekomponenten, Windräder und Sondertransporte mit Begleitfahrzeugen.',
    requirements: ['heavy_load', 'escort'],
    icon: '🏗️'
  }
],

// ── Trailer catalogue ────────────────────────────────────
TRAILERS: [
  {
    id: 'curtainsider',
    name: 'Planenauflieger',
    model: 'Krone Profiliner',
    type: 'standard',
    capacityBonus: 0,
    purchasePrice: 28000,
    maintenanceCostPerMonth: 120,
    description: 'Standard-Gardinenauflieger für Paletten und Stückgut.',
    compatibleWith: ['semi'],
    icon: '📦'
  },
  {
    id: 'reefer_trailer',
    name: 'Kühlauflieger',
    model: 'Schmitz Cargobull SKO Cool',
    type: 'reefer',
    capacityBonus: 0,
    purchasePrice: 52000,
    maintenanceCostPerMonth: 300,
    fuelConsumptionBonus: 2,
    description: 'Temperaturgeführter Transport von -25 °C bis +25 °C.',
    compatibleWith: ['semi'],
    requirements: ['cooling'],
    icon: '🧊'
  },
  {
    id: 'tank_trailer',
    name: 'Tankauflieger',
    model: 'Magyar Edelstahltank',
    type: 'tank',
    capacityBonus: 0,
    purchasePrice: 68000,
    maintenanceCostPerMonth: 350,
    description: 'Edelstahl-Tankauflieger für Lebensmittel, Chemie oder Kraftstoffe.',
    compatibleWith: ['semi'],
    requirements: ['adr'],
    icon: '🛢️'
  },
  {
    id: 'flatbed_trailer',
    name: 'Pritschenauflieger',
    model: 'Schmitz Cargobull SCB S3',
    type: 'flatbed',
    capacityBonus: 2000,
    purchasePrice: 24000,
    maintenanceCostPerMonth: 90,
    description: 'Für sperrige Güter, Maschinen und Bauteile.',
    compatibleWith: ['semi'],
    icon: '🏗️'
  },
  {
    id: 'mega_trailer',
    name: 'Mega-Auflieger',
    model: 'Krone Mega Liner',
    type: 'mega',
    capacityBonus: 1500,
    purchasePrice: 34000,
    maintenanceCostPerMonth: 140,
    description: 'Hochvolumen-Auflieger (3 m Innenhöhe) für voluminöse Güter.',
    compatibleWith: ['semi'],
    icon: '📫'
  },
  {
    id: 'silo_trailer',
    name: 'Siloauflieger',
    model: 'Feldbinder EUT 60.3',
    type: 'silo',
    capacityBonus: 0,
    purchasePrice: 75000,
    maintenanceCostPerMonth: 380,
    description: 'Für Schüttgut, Mehl, Granulat und Zement.',
    compatibleWith: ['semi'],
    icon: '🌾'
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
  // Warenklassen mit Vergütungsfaktoren:
  //   standard  → Faktor 1,0 (Pakete, Möbel, Konsumgüter)
  //   cooling   → Faktor 1,4 (Kühlware: Lebensmittel, Pharma)
  //   bulky     → Faktor 1,2 (Sperrgut: Maschinen, Baumaterial)
  //   hazmat    → Faktor 1,8 (Gefahrgut: Chemikalien, Treibstoff)
  CARGO_TYPES: [
    { id: 'general',   label: 'Allgemeingut',     icon: '📦', requiresVehicle: [],             category: 'standard', valueFactor: 1.0 },
    { id: 'food',      label: 'Lebensmittel',     icon: '🥗', requiresVehicle: [],             category: 'standard', valueFactor: 1.0 },
    { id: 'cooling',   label: 'Kühlware',         icon: '🧊', requiresVehicle: ['cooling'],    category: 'cooling',  valueFactor: 1.4 },
    { id: 'building',  label: 'Baustoffe',        icon: '🏗️', requiresVehicle: [],             category: 'bulky',    valueFactor: 1.2 },
    { id: 'hazmat',    label: 'Gefahrgut',        icon: '☢️', requiresVehicle: ['adr'],        category: 'hazmat',   valueFactor: 1.8 },
    { id: 'fuel',      label: 'Kraftstoff',       icon: '⛽', requiresVehicle: ['adr'],        category: 'hazmat',   valueFactor: 1.8 },
    { id: 'liquid',    label: 'Flüssigkeiten',    icon: '🛢️', requiresVehicle: [],             category: 'standard', valueFactor: 1.0 },
    { id: 'heavy',     label: 'Schwerlast',       icon: '⚓', requiresVehicle: ['heavy_load'], category: 'bulky',    valueFactor: 1.2 },
    { id: 'medical',   label: 'Medizingüter',     icon: '💊', requiresVehicle: [],             category: 'cooling',  valueFactor: 1.4 },
    { id: 'auto',      label: 'Fahrzeugteile',    icon: '🔧', requiresVehicle: [],             category: 'standard', valueFactor: 1.0 },
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
      eventProbabilityMod: 0.5,
      timeCostMod: 0.6    // 60% time-cost reduction for beginners (40% of base cost)
    },
    normal: {
      label: 'Normal',
      startMoney: 50000,
      orderPenaltyMod: 1.0,
      fuelPriceBase: 1.65,
      orderFrequency: 1.0,
      competitorActivity: 0.7,
      eventProbabilityMod: 1.0,
      timeCostMod: 1.0
    },
    schwer: {
      label: 'Schwer',
      startMoney: 25000,
      orderPenaltyMod: 1.5,
      fuelPriceBase: 1.85,
      orderFrequency: 0.75,
      competitorActivity: 1.0,
      eventProbabilityMod: 1.5,
      timeCostMod: 1.5    // 50% time-cost increase for experts
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
  // Approximate road distances in km between connected cities.
  // 4th element: road type – 'a'=Autobahn/Motorway, 'b'=Bundesstraße/National road
  CONNECTIONS: [
    ['hamburg',    'berlin',      286,  'a'],
    ['hamburg',    'bremen',       120, 'a'],
    ['hamburg',    'hannover',     151, 'a'],
    ['hamburg',    'kiel',         90,  'a'],
    ['hamburg',    'rostock',     220,  'a'],
    ['hamburg',    'kopenhagen',  350,  'b'],
    ['berlin',     'hannover',    248,  'a'],
    ['berlin',     'dresden',     193,  'a'],
    ['berlin',     'leipzig',     187,  'a'],
    ['berlin',     'prag',        350,  'b'],
    ['berlin',     'warschau',    576,  'a'],
    ['berlin',     'rostock',     231,  'a'],
    ['hannover',   'dortmund',    200,  'a'],
    ['hannover',   'bremen',       120, 'a'],
    ['hannover',   'bielefeld',   100,  'a'],
    ['hannover',   'frankfurt',   350,  'a'],
    ['dortmund',   'koeln',       75,   'a'],
    ['dortmund',   'essen',       30,   'a'],
    ['dortmund',   'duesseldorf', 60,   'a'],
    ['dortmund',   'bielefeld',   95,   'a'],
    ['koeln',      'bonn',        28,   'a'],
    ['koeln',      'frankfurt',   190,  'a'],
    ['koeln',      'duesseldorf', 45,   'a'],
    ['koeln',      'bruessel',    215,  'a'],
    ['koeln',      'amsterdam',   230,  'a'],
    ['frankfurt',  'nuernberg',   222,  'a'],
    ['frankfurt',  'stuttgart',   200,  'a'],
    ['frankfurt',  'mannheim',     77,  'a'],
    ['frankfurt',  'karlsruhe',   130,  'a'],
    ['frankfurt',  'prag',        380,  'b'],
    ['frankfurt',  'wien',        720,  'a'],
    ['stuttgart',  'muenchen',    218,  'a'],
    ['stuttgart',  'karlsruhe',   81,   'a'],
    ['stuttgart',  'zuerich',     200,  'b'],
    ['muenchen',   'nuernberg',   170,  'a'],
    ['muenchen',   'wien',        450,  'a'],
    ['muenchen',   'zuerich',     320,  'a'],
    ['muenchen',   'innsbruck',   153,  'a'],
    ['nuernberg',  'dresden',     295,  'a'],
    ['nuernberg',  'leipzig',     260,  'a'],
    ['dresden',    'prag',        148,  'b'],
    ['prag',       'wien',        330,  'b'],
    ['prag',       'bratislava',  330,  'b'],
    ['wien',       'budapest',    243,  'a'],
    ['wien',       'bratislava',   60,  'a'],
    ['wien',       'zagreb',      370,  'b'],
    ['budapest',   'zagreb',      360,  'b'],
    ['amsterdam',  'bruessel',    204,  'a'],
    ['amsterdam',  'paris',       500,  'a'],
    ['bruessel',   'paris',       304,  'a'],
    ['paris',      'lyon',        465,  'a'],
    ['paris',      'barcelona',   1040, 'a'],
    ['paris',      'madrid',      1270, 'b'],
    ['lyon',       'marseille',   315,  'a'],
    ['lyon',       'mailand',     300,  'a'],
    ['lyon',       'bern',        270,  'b'],
    ['marseille',  'barcelona',   490,  'a'],
    ['marseille',  'mailand',     460,  'a'],
    ['bern',       'zuerich',      130, 'a'],
    ['mailand',    'zuerich',     280,  'a'],
    ['mailand',    'rom',         570,  'a'],
    ['madrid',     'barcelona',   620,  'a'],
    ['madrid',     'lissabon',    627,  'a'],
    ['kopenhagen', 'stockholm',   660,  'a'],
    ['oslo',       'stockholm',   520,  'b'],
    ['oslo',       'kopenhagen',  580,  'b'],
    ['stockholm',  'helsinki',    900,  'b'],
    ['warschau',   'prag',        690,  'b'],
    ['warschau',   'bratislava',  620,  'b'],
    ['zagreb',     'bratislava',  370,  'b'],
    ['athen',      'budapest',    1400, 'b'],
  ]
};
