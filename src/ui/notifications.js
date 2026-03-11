import { $ } from '../utils.js';
import { GS } from '../state.js';
import { TOAST_DISPLAY_MS, TOAST_FADE_MS, CLOCK_FLASH_MS } from '../constants.js';

export function showToast(msg, type = 'info') {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div class="toast-message">${msg}</div>`;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, TOAST_DISPLAY_MS + TOAST_FADE_MS + 1400);

  if (GS.started) {
    GS.messageLog.push({
      t: { day: GS.time.day, month: GS.time.month, year: GS.time.year,
           hour: GS.time.hour, minute: GS.time.minute },
      msg,
      type,
    });
    if (GS.messageLog.length > 200) GS.messageLog.shift();
  }
}

export function showTimeAdvance(minutes, label) {
  const dateEl = $('sb-date');
  if (dateEl) {
    dateEl.classList.remove('time-flash');
    void dateEl.offsetWidth;
    dateEl.classList.add('time-flash');
    setTimeout(() => dateEl.classList.remove('time-flash'), CLOCK_FLASH_MS);
  }

  const container = $('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast time-advance';
  el.innerHTML = `<span class="ta-icon">⏰</span> <strong>+${minutes} Min</strong> <span class="ta-label">${label}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), TOAST_FADE_MS);
  }, TOAST_DISPLAY_MS);
}
