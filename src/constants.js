export const APP_VERSION = '1.2.2';

export const TIME_COSTS = {
  navigate:      5,
  assignOrder:  30,
  dispatchRoute: 30,
  hireStaff:    15,
  fireStaff:    15,
  buyVehicle:   15,
  sellVehicle:  15,
  maintenance:  30,
  repair:       15,
  assignDriver: 10,
  takeLoan:     15,
  refreshCand:   5,
};

export const REFUEL_THRESHOLD        = 0.15;
export const REFUEL_DURATION_MINUTES = 15;
export const RENDER_THROTTLE_MS      = 950;
export const TOAST_DISPLAY_MS        = 2200;
export const TOAST_FADE_MS           = 400;
export const CLOCK_FLASH_MS          = 650;
export const ORDER_POOL_MULTIPLIER   = 2.5;
export const MINUTES_PER_TICK        = 1;

export const REP_TIER_MAX_WEIGHT = { 1: 3000, 2: 8000, 3: 15000, 4: 26000, 5: Infinity };
export const REQ_LABELS = { cooling: 'Kühlung', adr: 'ADR-Zulassung', heavy_load: 'Schwerlastgenehmigung' };
