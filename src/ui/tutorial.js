import { GS } from '../state.js';
import { openPausedDialog } from '../game/engine.js';
import { registerProgressHook } from '../game/progression.js';
import {
  TUTORIAL_CHAPTERS,
  advanceTutorial,
  ensureTutorialState,
  getActiveTutorialStep,
  getNextLockedTutorialChapter,
  getTrainingOrders,
  getNextTutorialChapter,
  getTutorialChapter,
  getTutorialOverview,
  markTutorialChaptersOpened,
  pauseTutorial,
  resumeTutorial,
  shouldOfferTutorial,
  skipTutorialStep,
  startTutorialChapter,
  unlockTutorialChapters,
} from '../game/tutorial.js';
import { closeModal, isModalOpen, openModal } from './modal.js';
import { showToast } from './notifications.js';
import { confetti } from './fx.js';
import { autoSave } from '../game/save.js';
import { getCityName } from '../state.js';

let _waitingKey = null;
let _lastCoachHtml = null;

const _chapterNumber = chapter => TUTORIAL_CHAPTERS.indexOf(chapter) + 1;

// ── Dialog building blocks ───────────────────────────────────
function _stepsHtml(chapter, currentIndex) {
  return `<ol class="tutorial-steps">
    ${chapter.steps.map((step, index) => {
      const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
      return `
        <li class="tutorial-step-${state}">
          <span>${state === 'done' ? '✓' : index + 1}</span>
          <div><strong>${step.text}</strong>${state === 'current' ? `<small>${step.hint}</small>` : ''}</div>
        </li>`;
    }).join('')}
  </ol>`;
}

function _lessonsHtml(chapter) {
  return `
    <details class="tutorial-lessons">
      <summary>💡 Hintergrundwissen</summary>
      <ul>${chapter.lessons.map(([title, text]) => `<li><strong>${title}:</strong> ${text}</li>`).join('')}</ul>
    </details>`;
}

function _trainingHtml(chapter) {
  if (chapter.id !== 'tour-planning') return '';
  const orders = getTrainingOrders();
  if (orders.length < 2) return '';
  return `
    <div class="tutorial-training">
      <strong>🎓 Übungsaufträge liegen bereit</strong>
      <span>Ich habe dir zwei Ladungen in den Frachtmarkt gelegt, die perfekt zusammenpassen:</span>
      <ol>${orders.map(order => `<li>${getCityName(order.origin)} → ${getCityName(order.destination)}</li>`).join('')}</ol>
      <small>Die zweite startet genau dort, wo die erste endet – so fährt dein LKW nicht leer zurück.</small>
    </div>`;
}

function _announcePrepared(orders) {
  if (!orders?.length) return;
  showToast(`🎓 ${orders.length} Übungsaufträge liegen im Frachtmarkt bereit: ${orders.map(order => `${getCityName(order.origin)} → ${getCityName(order.destination)}`).join(' und ')}`, 'info');
}

const _waitHtml = reason => reason
  ? `<div class="tutorial-wait">⏳ <span><strong>Noch nicht möglich:</strong> ${reason} Ich melde mich, sobald es weitergeht.</span></div>`
  : '';

function _chapterBody(chapter, { completed = null, welcome = false } = {}) {
  const tutorial = ensureTutorialState();
  const isActive = tutorial.activeChapter === chapter.id;
  const isDone = tutorial.completed.includes(chapter.id);
  const currentIndex = isActive ? tutorial.stepIndex : isDone ? chapter.steps.length : 0;
  const info = isActive ? getActiveTutorialStep() : null;

  let footer;
  if (welcome) {
    footer = `
      <button class="btn btn-secondary" onclick="pauseTutorialGuide()">Ohne Tutorial spielen</button>
      <button class="btn btn-primary" onclick="startTutorialGuide()">Los geht’s →</button>`;
  } else if (isActive) {
    footer = `
      <button class="btn btn-secondary" onclick="pauseTutorialGuide()">Tutorial pausieren</button>
      <button class="btn btn-secondary" onclick="openTutorialLibrary()">Alle Kapitel</button>
      <button class="btn btn-primary" onclick="dismissTutorialDialog()">Los geht’s →</button>`;
  } else {
    footer = `
      <button class="btn btn-secondary" onclick="openTutorialLibrary()">Alle Kapitel</button>
      <button class="btn btn-primary" onclick="startTutorialChapterFromUi('${chapter.id}')">${isDone ? 'Kapitel wiederholen' : 'Kapitel starten'}</button>`;
  }

  return `
    <div class="tutorial-intro">
      ${completed ? `<div class="tutorial-complete-banner">🏆 <strong>${completed.title}</strong> geschafft!</div>` : ''}
      <div class="tutorial-hero">${chapter.icon}</div>
      <div class="tutorial-kicker">${welcome ? 'Willkommen in deiner Spedition' : `Ausbildung · Kapitel ${_chapterNumber(chapter)} von ${TUTORIAL_CHAPTERS.length}`}</div>
      <h3>${chapter.title}</h3>
      <p>${chapter.summary}</p>
      ${welcome ? '<p class="tutorial-welcome-note">Ich führe dich Schritt für Schritt durch deinen ersten Arbeitstag. Der hervorgehobene Knopf zeigt dir jeweils, wo es weitergeht.</p>' : ''}
      ${_stepsHtml(chapter, currentIndex)}
      ${info ? _waitHtml(info.waitReason) : ''}
      ${isActive ? _trainingHtml(chapter) : ''}
      ${_lessonsHtml(chapter)}
      <div class="modal-footer">${footer}</div>
    </div>`;
}

// ── Chapter flow ─────────────────────────────────────────────
/** Starts the next unlocked chapter, silently passing chapters the player already mastered. */
function _activateNextChapter() {
  for (let guard = 0; guard < TUTORIAL_CHAPTERS.length; guard++) {
    const next = getNextTutorialChapter();
    if (!next) return null;
    startTutorialChapter(next.id);
    const result = advanceTutorial(null);
    if (!result.completed) return next;
    showToast(`🎓 Kapitel „${next.title}“ hast du bereits gemeistert.`, 'success');
  }
  return null;
}

function _presentCompletion(completed) {
  confetti({ count: 70, originY: 0.2 });
  showToast(`🎓 Kapitel abgeschlossen: <strong>${completed.title}</strong>`, 'success');
  unlockTutorialChapters();
  const next = _activateNextChapter();
  autoSave();

  if (next) {
    openPausedDialog('🎓 Kapitel geschafft!', () => _chapterBody(next, { completed }));
    return;
  }
  const locked = getNextLockedTutorialChapter();
  openPausedDialog('🎓 Kapitel geschafft!', () => `
    <div class="tutorial-complete">
      <div class="tutorial-complete-hero">🏆</div>
      <h3>${completed.title}</h3>
      ${locked ? `
        <p>Spiel jetzt frei weiter. Das nächste Kapitel öffnet sich automatisch, sobald du so weit bist.</p>
        <div class="tutorial-next-lock-card">
          <span>Als Nächstes · Kapitel ${_chapterNumber(locked)}</span>
          <strong>${locked.icon} ${locked.title}</strong>
          <small>🔓 ${locked.unlockHint}</small>
        </div>` : '<p>Du hast alle Ausbildungskapitel gemeistert. Jetzt gehört die Straße dir!</p>'}
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Weiter spielen →</button></div>
    </div>`);
}

function _announceReadiness() {
  const info = getActiveTutorialStep();
  const key = info ? `${info.chapter.id}:${info.index}` : null;
  if (info?.waitReason) {
    _waitingKey = key;
    return;
  }
  if (_waitingKey && _waitingKey === key) {
    showToast(`🎓 Jetzt geht’s weiter: ${info.step.text}`, 'info');
  }
  _waitingKey = null;
}

function _process(event = null) {
  if (!GS.started) return;
  unlockTutorialChapters();
  const tutorial = ensureTutorialState();
  if (tutorial.status !== 'active') {
    renderTutorialCoach();
    return;
  }

  if (!tutorial.activeChapter) {
    const next = _activateNextChapter();
    if (next) {
      autoSave();
      openPausedDialog('🎓 Neues Ausbildungs-Kapitel', () => _chapterBody(next));
    }
  } else {
    const result = advanceTutorial(event);
    _announcePrepared(result.prepared);
    if (result.completed) {
      _presentCompletion(result.completed);
    } else if (result.advanced) {
      autoSave();
      showToast(`✅ Erledigt! Nächster Schritt: ${getActiveTutorialStep().step.text}`, 'success');
    }
  }
  _announceReadiness();
  renderTutorialCoach();
}

// ── Coach widget & highlighting ──────────────────────────────
function _isVisible(element) {
  return !!element && element.getClientRects().length > 0;
}

function _applyHighlight(selectors) {
  document.querySelectorAll('[data-coach-target]').forEach(element => {
    element.classList.remove('tutorial-target');
    delete element.dataset.coachTarget;
  });
  for (const selector of selectors || []) {
    const element = [...document.querySelectorAll(selector)].find(_isVisible);
    if (element) {
      element.classList.add('tutorial-target');
      element.dataset.coachTarget = '1';
      return;
    }
  }
}

function _coachHtml() {
  const tutorial = ensureTutorialState();
  if (!GS.started || tutorial.status !== 'active') return { html: '', targets: null };

  const info = getActiveTutorialStep();
  if (!info) {
    const locked = getNextLockedTutorialChapter();
    if (!locked) return { html: '', targets: null };
    return {
      html: `
        <button class="tc-idle" onclick="openTutorialLibrary()">
          <span class="tc-icon">🎓</span>
          <span><small>Nächstes Ausbildungs-Kapitel</small><strong>${locked.title}</strong><span>🔓 ${locked.unlockHint}</span></span>
        </button>`,
      targets: null,
    };
  }

  const { chapter, step, index, total, waitReason } = info;
  const canSkipTime = GS.vehicles.some(vehicle => vehicle.status === 'driving' || vehicle.status === 'maintenance');
  const targets = waitReason ? (canSkipTime ? ['#btn-skip-event'] : null) : step.target;
  const collapsed = tutorial.coachCollapsed;
  const head = `
    <div class="tc-head">
      <span class="tc-icon">${chapter.icon}</span>
      <span class="tc-title">
        <small>Kapitel ${_chapterNumber(chapter)}/${TUTORIAL_CHAPTERS.length} · Schritt ${index + 1}/${total}</small>
        <strong>${chapter.title}</strong>
      </span>
      <button class="tc-toggle" onclick="toggleTutorialCoach()" title="${collapsed ? 'Aufklappen' : 'Einklappen'}">${collapsed ? '▴' : '▾'}</button>
    </div>`;

  if (collapsed) {
    return { html: `${head}<div class="tc-current ${waitReason ? 'tc-waiting' : ''}">${waitReason ? '⏳' : '▶'} ${step.text}</div>`, targets };
  }

  return {
    html: `
      ${head}
      <ul class="tc-steps">
        ${chapter.steps.map((item, itemIndex) => `
          <li class="${itemIndex < index ? 'done' : itemIndex === index ? 'current' : ''}">
            <span>${itemIndex < index ? '✓' : itemIndex === index ? '▶' : '○'}</span>${item.text}
          </li>`).join('')}
      </ul>
      ${waitReason
        ? `<div class="tc-wait">⏳ ${waitReason}</div>`
        : `<div class="tc-hint">💡 ${step.hint}</div>`}
      <div class="tc-actions">
        <button onclick="openTutorialChapter('${chapter.id}')">Details</button>
        <button onclick="skipTutorialStepFromUi()">Schritt überspringen</button>
        <button onclick="pauseTutorialGuide()">Pausieren</button>
      </div>`,
    targets,
  };
}

export function renderTutorialCoach() {
  const element = document.getElementById('tutorial-coach');
  if (!element) return;
  const { html, targets } = _coachHtml();
  if (html !== _lastCoachHtml) {
    element.innerHTML = html;
    element.classList.toggle('visible', !!html);
    element.classList.toggle('collapsed', ensureTutorialState().coachCollapsed);
    _lastCoachHtml = html;
  }
  _applyHighlight(targets);
}

// ── Window actions ───────────────────────────────────────────
function _showWelcome() {
  const first = TUTORIAL_CHAPTERS[0];
  openPausedDialog('🎓 Ausbildungsprogramm', () => _chapterBody(first, { welcome: true }), () => {
    // Closing the welcome dialog without a choice starts the guidance.
    if (shouldOfferTutorial()) _beginTutorial();
  });
}

function _beginTutorial() {
  resumeTutorial();
  if (!ensureTutorialState().activeChapter) _activateNextChapter();
  autoSave();
  _process(null);
}

export function startTutorialGuide() {
  _beginTutorial();
  closeModal();
}

export function pauseTutorialGuide() {
  pauseTutorial();
  autoSave();
  if (isModalOpen()) closeModal();
  renderTutorialCoach();
  showToast('Tutorial pausiert. Im Büro kannst du es über 🎓 Ausbildungsheft jederzeit fortsetzen.', 'info');
}

export function resumeTutorialGuide() {
  if (isModalOpen()) closeModal();
  resumeTutorial();
  autoSave();
  _process(null);
}

export function dismissTutorialDialog() {
  closeModal();
  renderTutorialCoach();
}

export function startTutorialChapterFromUi(chapterId) {
  if (!getTutorialChapter(chapterId)) return;
  if (isModalOpen()) closeModal();
  startTutorialChapter(chapterId);
  autoSave();
  _process(null);
}

export function skipTutorialStepFromUi() {
  const result = skipTutorialStep();
  if (result.completed) _presentCompletion(result.completed);
  autoSave();
  _announceReadiness();
  renderTutorialCoach();
}

export function toggleTutorialCoach() {
  const tutorial = ensureTutorialState();
  tutorial.coachCollapsed = !tutorial.coachCollapsed;
  renderTutorialCoach();
}

export function openTutorialLibrary() {
  if (!GS.started) return;
  if (isModalOpen()) closeModal();
  markTutorialChaptersOpened();
  autoSave();
  const tutorial = ensureTutorialState();
  const chapters = getTutorialOverview();
  const completed = chapters.filter(chapter => chapter.completed).length;
  openModal('🎓 Ausbildungsheft', `
    <div class="tutorial-library-summary">
      <div><strong>${completed} / ${chapters.length}</strong> Kapitel abgeschlossen</div>
      ${tutorial.status === 'paused' || tutorial.status === 'new'
        ? '<button class="btn btn-primary btn-sm" onclick="resumeTutorialGuide()">▶ Tutorial fortsetzen</button>'
        : '<span>Neue Kapitel öffnen sich automatisch durch deinen Spielfortschritt.</span>'}
    </div>
    <div class="tutorial-library">
      ${chapters.map(chapter => `
        <button class="tutorial-library-card ${chapter.unlocked ? '' : 'locked'} ${chapter.completed ? 'completed' : ''} ${chapter.active ? 'active' : ''}"
          ${chapter.unlocked ? `onclick="openTutorialChapter('${chapter.id}')"` : 'disabled'}>
          <span class="tutorial-library-icon">${chapter.unlocked ? chapter.icon : '🔒'}</span>
          <span class="tutorial-library-copy">
            <span class="tutorial-library-number">Kapitel ${chapter.index + 1}</span>
            <strong>${chapter.unlocked ? chapter.title : 'Noch verschlossen'}</strong>
            <small>${chapter.unlocked ? chapter.summary : `🔓 ${chapter.unlockHint}`}</small>
          </span>
          <span class="tutorial-library-state">${chapter.completed ? '✓ Geschafft' : chapter.active ? '▶ Aktiv' : chapter.unlocked ? 'Öffnen →' : ''}</span>
        </button>`).join('')}
    </div>`);
}

export function openTutorialChapter(chapterId) {
  if (!GS.started) return;
  const chapter = getTutorialChapter(chapterId);
  if (!chapter) return;
  if (isModalOpen()) closeModal();
  openModal('🎓 Ausbildungsheft', _chapterBody(chapter));
}

export function registerTourTutorial() {
  registerProgressHook('game-started', () => {
    _lastCoachHtml = null;
    _waitingKey = null;
    unlockTutorialChapters();
    setTimeout(() => {
      if (shouldOfferTutorial()) _showWelcome();
      else _process(null);
    }, 0);
  });
  registerProgressHook('progress-changed', () => _process(null));
  registerProgressHook('tutorial-action', event => _process(event));
}
