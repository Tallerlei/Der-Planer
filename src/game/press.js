import { DATA } from '../data.js';
import { GS } from '../state.js';
import { PRESS_COOLDOWN_DAYS } from '../constants.js';
import {
  ensureProgressState, emitProgressEvent, hasProgressHook, changeCompanyReputation,
} from './progression.js';

let _pending = null;

export function hasPendingPress() { return !!_pending; }

function _shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Opens a press conference for the given situation if none is pending,
 * a presenter is registered and the cooldown has elapsed.
 * Returns true when a conference was started.
 */
export function triggerPressConference(situation, rng = Math.random) {
  if (_pending || !hasProgressHook('press')) return false;
  const entry = DATA.PRESS_CONFERENCE.find(p => p.situation === situation);
  if (!entry) return false;

  const p = ensureProgressState();
  if (p.lastPressMinute !== null && GS.time.totalMinutes - p.lastPressMinute < PRESS_COOLDOWN_DAYS * 1440) return false;
  p.lastPressMinute = GS.time.totalMinutes;

  const options = _shuffle(entry.options.map((o, i) => ({ ...o, originalIndex: i })), rng);
  _pending = { situation, options };
  emitProgressEvent('press', {
    situation,
    icon: entry.icon || '🎤',
    question: entry.question,
    options: options.map(o => ({ text: o.text })),
  });
  return true;
}

/**
 * Answers the pending press conference. Closing without answering counts
 * as a cautious non-answer (the option with the median reputation effect).
 * Returns { headline, reputationMod } or null.
 */
export function answerPressConference(idx) {
  if (!_pending) return null;
  const { options } = _pending;
  _pending = null;

  let chosen = options[idx];
  if (!chosen) {
    const sorted = options.slice().sort((a, b) => a.reputationMod - b.reputationMod);
    chosen = sorted[Math.floor(sorted.length / 2)];
  }
  const applied = changeCompanyReputation(chosen.reputationMod);
  if (chosen.reputationMod > 0) ensureProgressState().pressPositive++;
  emitProgressEvent('progress-check');
  return { headline: chosen.headline || chosen.text, reputationMod: applied };
}

export function _resetPress() { _pending = null; }
