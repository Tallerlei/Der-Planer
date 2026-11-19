export const APP_VERSION = '1.23.1';

export const TIME_COSTS = {
  navigate: 5,
  assignOrder: 30,
  hireStaff: 15,
  fireStaff: 15,
  buyVehicle: 15,
  sellVehicle: 15,
  maintenance: 30,
  repair: 15,
  assignDriver: 10,
  removeDriver: 10,
  takeLoan: 15,
  refreshCand: 5,
  buyTrailer: 15,
  detachTrailer: 10,
  attachTrailer: 10,
};

/** Global base price range per km for standard freight orders (€/km). */
export const BASE_MIN_KM_PRICE = 5.0;
export const BASE_MAX_KM_PRICE = 12.0;

/** Per-cargo-type km price multiplier applied on top of the [5–12] €/km base.
 *  Formula: random(BASE_MIN, BASE_MAX) × CARGO_TYPE_KM_FACTORS[type] × urgencyFactor */
export const CARGO_TYPE_KM_FACTORS = {
  general:  1.0,
  food:     1.1,
  building: 1.0,
  liquid:   1.1,
  cooling:  1.3,
  auto:     1.2,
  heavy:    1.2,
  medical:  1.5,
  fuel:     1.5,
  hazmat:   1.5,
};

export const REFUEL_THRESHOLD = 0.15;
export const REFUEL_DURATION_MINUTES = 15;
export const MAINTENANCE_DURATION_MINUTES = 120;
export const RENDER_THROTTLE_MS = 950;
export const TOAST_DISPLAY_MS = 2200;
export const TOAST_FADE_MS = 400;
export const CLOCK_FLASH_MS = 650;
export const ORDER_POOL_MULTIPLIER = 2.5;
export const MIN_ORDER_POOL = 8;
export const MINUTES_PER_TICK = 1;

/** Fraction of each order-generation batch guaranteed to be single-trip
 *  feasible for the current fleet (weight ≤ max vehicle capacity, requirements met). */
export const FLEET_COMPATIBLE_ORDER_RATIO = 0.4;

export const REP_TIER_MAX_WEIGHT = { 1: 3000, 2: 8000, 3: 15000, 4: 26000, 5: Infinity };
export const REQ_LABELS = { cooling: 'Kühlung', adr: 'ADR-Zulassung', heavy_load: 'Schwerlastgenehmigung' };

/** Punctuality streak: each consecutive on-time delivery adds this bonus fraction (capped). */
export const STREAK_BONUS_PER_STEP = 0.025;
export const STREAK_BONUS_MAX      = 0.25;

/** Gold orders: rare, lucrative VIP orders with a short acceptance window. */
export const GOLD_ORDER_CHANCE       = 0.06;
export const GOLD_ORDER_VALUE_MULT   = 2.5;
export const GOLD_ORDER_EXPIRY_DAYS  = 0.5;

/** Driver experience: XP needed per level step = current skill × this value. */
export const DRIVER_XP_PER_LEVEL = 120;
export const DRIVER_MAX_SKILL    = 5;
export const DRIVER_TITLES = { 1: 'Neuling', 2: 'Fahrer', 3: 'Routinier', 4: 'Kapitän der Landstraße', 5: 'Legende' };

/** Interactive road events: chance per driving vehicle per game hour and global cooldown. */
export const ROAD_EVENT_CHANCE_PER_VEHICLE_HOUR = 0.05;
export const ROAD_EVENT_COOLDOWN_MINUTES        = 360;

/** Minimum game days between two press conferences. */
export const PRESS_COOLDOWN_DAYS = 5;

/** Reputation warning thresholds for the dashboard and office indicator. */
export const REP_WARNING_THRESHOLD = 25;
export const REP_DANGER_THRESHOLD  = 10;

/** Centralized vehicle status badge class and German label, keyed by status string. */
export const VEHICLE_STATUS_INFO = {
  idle: { badge: 'badge-success', label: 'Bereit' },
  driving: { badge: 'badge-info', label: 'Unterwegs' },
  maintenance: { badge: 'badge-warning', label: 'Wartung' },
  broken: { badge: 'badge-danger', label: 'Defekt' },
};

/** German labels for meaningful route stop actions. */
export const NEXT_ACTION_LABELS = {
  pickup: 'Abholung',
  delivery: 'Lieferung',
  return: 'Rückkehr',
};
