import { APP_VERSION } from './constants.js';
import { debounce } from './utils.js';
import { autoSave, deleteSave, hasSave } from './game/save.js';
import {
  registerRenderer,
  startNewGame, loadAndContinue,
  setSpeed, jumpToNextEvent,
  acceptOrder, declineOrder,
  declineUnfulfillableOrders, confirmDeclineUnfulfillable,
  reassignOrder, addVehicleToOrder, moveOrderInQueue,
  refreshCandidates,
} from './game/engine.js';
import { showToast } from './ui/notifications.js';
import { closeModal, openEventsModal, openSettingsModal, openStatsModal, openLogModal, openReputationDashboard } from './ui/modal.js';
import { showScreen, navigateToScreen, registerScreenRenderer } from './ui/screens.js';
import { renderFleet, renderCatalog, assignDriver, removeDriver, sendToMaintenance, repairVehicle, sellVehicle, buyVehicle, buyTrailerForVehicle, detachTrailerFromVehicle, attachTrailerToVehicle, sellTrailer } from './ui/fleet.js';
import { renderOrders, switchOrderTab, saveOrderVehicleSelection, openClientModal, setOrderSort, showMoreCompletedOrders } from './ui/orders_ui.js';
import { renderPersonnel, fireStaff, hireStaff } from './ui/personnel.js';
import { renderFinance, takeLoan } from './ui/finance_ui.js';
import { renderOffice, officeAction } from './ui/office.js';
import {
  renderMapScreen, setMapZoom, mapZoomIn, mapZoomOut, mapJumpTo, mapJumpToVehicle,
  openVehicleInfoPanel, selectVehicleOnMap, deselectVehicleOnMap,
  handleMapScreenClick, handleMapScreenWheel,
  handleMapScreenMouseDown, handleMapScreenMouseMove, handleMapScreenMouseUp,
  updateZoomButtons,
} from './ui/map.js';
import { updateOrderBadge } from './ui/statusbar.js';
import { registerDialogs, openAchievementsModal, openCampaignModal } from './ui/dialogs.js';
import { registerProgressHook } from './game/progression.js';
import { startMenuScene, stopMenuScene, ensureVehicleThumbs, onThumbsReady } from './three/assets.js';


// ── Register renderers with the engine ────────────────────────
registerRenderer('fleet',    renderFleet);
registerRenderer('orders',   renderOrders);
registerRenderer('map',      renderMapScreen);
registerRenderer('finance',  renderFinance);
registerRenderer('office',   renderOffice);
registerRenderer('personnel', renderPersonnel);
registerRenderer('orders-badge', updateOrderBadge);
registerRenderer('screen-show-office', () => showScreen('office'));

// ── Gameplay dialogs (road events, press, campaign, achievements) ──
registerDialogs();
registerProgressHook('game-started', () => {
  stopMenuScene();
  ensureVehicleThumbs();
});

// Re-render screens that show vehicle images once the 3D thumbnails are ready
onThumbsReady(() => {
  const screen = document.querySelector('.screen.active')?.id?.replace('screen-', '');
  if (screen === 'fleet') {
    renderFleet();
    const catalog = document.getElementById('catalog-list');
    if (catalog && catalog.style.display !== 'none') renderCatalog();
  }
});

// ── Register screen renderers ─────────────────────────────────
registerScreenRenderer('office',    renderOffice);
registerScreenRenderer('fleet',     renderFleet);
registerScreenRenderer('orders',    renderOrders);
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
  jumpToNextEvent,

  acceptOrder,
  declineOrder,
  declineUnfulfillableOrders,
  confirmDeclineUnfulfillable,
  reassignOrder,
  addVehicleToOrder,
  moveOrderInQueue,
  saveOrderVehicleSelection,
  switchOrderTab,
  openClientModal,
  setOrderSort,
  showMoreCompletedOrders,

  assignDriver,
  removeDriver,
  sendToMaintenance,
  repairVehicle,
  sellVehicle,
  buyVehicle,
  buyTrailerForVehicle,
  detachTrailerFromVehicle,
  attachTrailerToVehicle,
  sellTrailer,

  fireStaff,
  hireStaff,
  refreshCandidates,

  takeLoan,

  officeAction,
  openEventsModal,
  openSettingsModal,
  openStatsModal,
  openLogModal,
  openReputationDashboard,
  openAchievementsModal,
  openCampaignModal,
  closeModal,

  setMapZoom,
  mapZoomIn,
  mapZoomOut,
  mapJumpTo,
  mapJumpToVehicle,
  openVehicleInfoPanel,
  selectVehicleOnMap,
  deselectVehicleOnMap,

  autoSave,
  deleteSave,
  showToast,
});

// ── DOM init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Speed buttons
  document.querySelectorAll('.speed-btn[data-speed]').forEach(b => {
    b.addEventListener('click', () => setSpeed(parseInt(b.dataset.speed)));
  });

  // Skip-to-next-event button
  const skipBtn = document.getElementById('btn-skip-event');
  if (skipBtn) skipBtn.addEventListener('click', jumpToNextEvent);

  // Map screen canvas
  const msc = document.getElementById('map-screen-canvas');
  if (msc) {
    msc.addEventListener('mousedown',  handleMapScreenMouseDown);
    msc.addEventListener('mousemove',  handleMapScreenMouseMove);
    msc.addEventListener('mouseup',    handleMapScreenMouseUp);
    msc.addEventListener('mouseleave', handleMapScreenMouseUp);
    msc.addEventListener('click',      handleMapScreenClick);
    msc.addEventListener('wheel',      handleMapScreenWheel, { passive: false });
  }

  // Animated 3D menu background + background-render vehicle images
  startMenuScene(document.getElementById('menu-scene'));
  setTimeout(() => ensureVehicleThumbs(), 1500);

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
      const trailerPool = document.getElementById('trailer-pool');
      if (t.id === 'fleet-tab-mine') {
        if (fleetList)   fleetList.style.display   = '';
        if (catalogList) catalogList.style.display = 'none';
        renderFleet();
      } else {
        if (fleetList)   fleetList.style.display   = 'none';
        if (catalogList) catalogList.style.display = '';
        if (trailerPool) trailerPool.style.display = 'none';
        renderCatalog();
      }
    });
  });

  // Order tabs
  document.querySelectorAll('.order-tab').forEach(t => {
    t.addEventListener('click', () => switchOrderTab(t.dataset.tab));
  });

  // Modal close on overlay click
  const ov = document.getElementById('modal-overlay');
  if (ov) ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });

  // Resize map on window resize (debounced to avoid excessive redraws)
  window.addEventListener('resize', debounce(() => {
    const currentScreen = document.querySelector('.screen.active')?.id?.replace('screen-', '');
    if (currentScreen === 'map') renderMapScreen();
  }, 150));
});
