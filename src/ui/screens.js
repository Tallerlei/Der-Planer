import { $ } from '../utils.js';
import { GS } from '../state.js';
import { TIME_COSTS } from '../constants.js';
import { advanceGameTime } from '../game/engine.js';

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $('screen-' + name);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
  });

  GS.ui.currentScreen = name;
  _triggerScreenRender(name);
}

export function navigateToScreen(name) {
  showScreen(name);
  if (GS.started) advanceGameTime(TIME_COSTS.navigate, 'Bildschirmwechsel');
}

// Render callbacks - set by main.js after all modules load
const _screenRenderers = {};
export function registerScreenRenderer(name, fn) { _screenRenderers[name] = fn; }

function _triggerScreenRender(name) {
  if (_screenRenderers[name]) _screenRenderers[name]();
}
