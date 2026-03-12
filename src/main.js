import { APP_VERSION } from './constants.js';
import { autoSave, deleteSave, hasSave } from './game/save.js';
import {
  registerRenderer,
  startNewGame, loadAndContinue,
  setSpeed,
  acceptOrder, declineOrder,
  declineUnfulfillableOrders, confirmDeclineUnfulfillable,
  refreshCandidates,
} from './game/engine.js';
import { showToast } from './ui/notifications.js';
import { closeModal, openEventsModal, openSettingsModal, openStatsModal, openLogModal } from './ui/modal.js';
import { showScreen, navigateToScreen, registerScreenRenderer } from './ui/screens.js';
import { renderFleet, renderCatalog, assignDriver, removeDriver, sendToMaintenance, repairVehicle, sellVehicle, buyVehicle, openRouteForVehicle } from './ui/fleet.js';
import { renderOrders, switchOrderTab, saveOrderVehicleSelection } from './ui/orders_ui.js';
import {
  renderRoutePlanner, selectRouteVehicle, removeRouteStop, dispatchRoute, handleMapClick, drawRouteMap,
} from './ui/routes.js';
import { renderPersonnel, fireStaff, hireStaff } from './ui/personnel.js';
import { renderFinance, takeLoan } from './ui/finance_ui.js';
import { renderOffice, officeAction } from './ui/office.js';
import {
  renderMapScreen, setMapZoom, mapJumpTo, mapJumpToVehicle,
  openVehicleInfoPanel, handleMapScreenClick, handleMapScreenWheel,
  updateZoomButtons,
} from './ui/map.js';
import { updateOrderBadge } from './ui/statusbar.js';


// ── Register renderers with the engine ────────────────────────
registerRenderer('fleet',    renderFleet);
registerRenderer('orders',   renderOrders);
registerRenderer('map',      renderMapScreen);
registerRenderer('finance',  renderFinance);
registerRenderer('office',   renderOffice);
registerRenderer('personnel', renderPersonnel);
registerRenderer('orders-badge', updateOrderBadge);
registerRenderer('screen-show-office', () => showScreen('office'));

// ── Register screen renderers ─────────────────────────────────
registerScreenRenderer('office',    renderOffice);
registerScreenRenderer('fleet',     renderFleet);
registerScreenRenderer('orders',    renderOrders);
registerScreenRenderer('routes',    renderRoutePlanner);
registerScreenRenderer('personnel', renderPersonnel);
registerScreenRenderer('finance',   renderFinance);
registerScreenRenderer('map',       renderMapScreen);

// ── Expose functions to window for HTML onclick attributes ────
Object.assign(window, {
  startNewGame,
  loadAndContinue,
  navigateToScreen,
  showScreen,
  setSpeed,

  acceptOrder,
  declineOrder,
  declineUnfulfillableOrders,
  confirmDeclineUnfulfillable,
  saveOrderVehicleSelection,
  switchOrderTab,

  assignDriver,
  removeDriver,
  sendToMaintenance,
  repairVehicle,
  sellVehicle,
  buyVehicle,
  openRouteForVehicle,

  selectRouteVehicle,
  removeRouteStop,
  dispatchRoute,

  fireStaff,
  hireStaff,
  refreshCandidates,

  takeLoan,

  officeAction,
  openEventsModal,
  openSettingsModal,
  openStatsModal,
  openLogModal,
  closeModal,

  setMapZoom,
  mapJumpTo,
  mapJumpToVehicle,
  openVehicleInfoPanel,

  autoSave,
  deleteSave,
  showToast,
});

// ── DOM init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Speed buttons
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.addEventListener('click', () => setSpeed(parseInt(b.dataset.speed)));
  });

  // Map canvas click (route planner)
  const mc = document.getElementById('map-canvas');
  if (mc) mc.addEventListener('click', handleMapClick);

  // Map screen canvas
  const msc = document.getElementById('map-screen-canvas');
  if (msc) {
    msc.addEventListener('click', handleMapScreenClick);
    msc.addEventListener('wheel', handleMapScreenWheel, { passive: false });
  }

  // Check for saved game
  if (hasSave()) {
    const btn = document.getElementById('btn-continue');
    if (btn) btn.style.display = 'inline-flex';
  }

  // Version display (info pane + status bar)
  const vEl = document.getElementById('info-version');
  if (vEl) vEl.textContent = APP_VERSION;
  const sbV = document.getElementById('sb-version');
  if (sbV) sbV.textContent = `v${APP_VERSION}`;

  // Menu tabs
  document.querySelectorAll('.menu-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.menu-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.menu-pane').forEach(p => {
        p.style.display = p.id === 'pane-' + t.dataset.tab ? '' : 'none';
      });
    });
  });

  // Difficulty options
  document.querySelectorAll('.diff-option').forEach(d => {
    d.addEventListener('click', () => {
      document.querySelectorAll('.diff-option').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
    });
  });

  // Mode options
  document.querySelectorAll('.mode-option').forEach(m => {
    m.addEventListener('click', () => {
      document.querySelectorAll('.mode-option').forEach(x => x.classList.remove('selected'));
      m.classList.add('selected');
    });
  });

  // Fleet tabs
  document.querySelectorAll('.fleet-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.fleet-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const fleetList   = document.getElementById('fleet-list');
      const catalogList = document.getElementById('catalog-list');
      if (t.id === 'fleet-tab-mine') {
        if (fleetList)   fleetList.style.display   = '';
        if (catalogList) catalogList.style.display = 'none';
        renderFleet();
      } else {
        if (fleetList)   fleetList.style.display   = 'none';
        if (catalogList) catalogList.style.display = '';
        renderCatalog();
      }
    });
  });

  // Order tabs
  document.querySelectorAll('.order-tab').forEach(t => {
    t.addEventListener('click', () => switchOrderTab(t.dataset.tab));
  });

  // Dispatch route
  const dispBtn = document.getElementById('btn-dispatch');
  if (dispBtn) dispBtn.addEventListener('click', dispatchRoute);

  // Modal close on overlay click
  const ov = document.getElementById('modal-overlay');
  if (ov) ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });

  // Resize map on window resize
  window.addEventListener('resize', () => {
    const currentScreen = document.querySelector('.screen.active')?.id?.replace('screen-', '');
    if (currentScreen === 'map')    renderMapScreen();
    if (currentScreen === 'routes') drawRouteMap();
  });
});
