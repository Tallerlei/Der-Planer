import { DATA } from './data.js';

export const GS = {
  started: false,
  paused: false,
  speed: 1,
  tickMs: 1000,

  company: {
    name: 'Meine Spedition',
    mode: 'story',
    difficulty: 'normal',
    hqCity: 'frankfurt',
    werbevertrag_aktiv: false,
    werbevertrag_booster: 0.0,
    reputationTier: 3,
  },

  time: { day: 1, month: 3, year: 1994, hour: 8, minute: 0, totalMinutes: 0 },

  finance: {
    balance: 50000,
    monthRevenue: 0,
    monthExpenses: 0,
    transactions: [],
  },

  vehicles: [],
  staff:    [],
  orders: {
    available: [],
    active:    [],
    completed: [],
    declined:  [],
  },

  market: {
    fuelPrice: 1.65,
    orderValueMod: 1.0,
    orderVolumeMod: 1.0,
    speedMod: 1.0,
    activeEvents: [],
  },

  stats: {
    totalRevenue: 0,
    totalExpenses: 0,
    ordersCompleted: 0,
    ordersFailed: 0,
    kmDriven: 0,
  },

  ui: {
    currentScreen: 'menu',
    orderTab: 'available',
    routeVehicleId: null,
    routeStops: [],
    mapHighlight: null,
    lastOrderCheckMin: 0,
    lastEventCheckMin: 0,
    lastSalaryDay: 1,
    lastRenderMs: 0,
    mapZoom: 1,
    mapCenter: { x: 400, y: 260 },
    selectedVehicleId: null,
    orderVehicleSelection: {},
  },

  clientReputation: {},
  clientStats: {},

  notifications: [],
  messageLog: [],
  pressConference: null,
  hireCandidates: [],
};

export const cityById = {};
DATA.CITIES.forEach(c => { cityById[c.id] = c; });

export function getCityName(id) { return cityById[id] ? cityById[id].name : id; }
