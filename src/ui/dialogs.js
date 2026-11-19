import { GS } from '../state.js';
import { fmt } from '../utils.js';
import { DATA } from '../data.js';
import {
  registerProgressHook, ACHIEVEMENTS, CHAPTERS, getChapterStatus, isStoryMode, ensureProgressState,
} from '../game/progression.js';
import { resolveRoadEvent } from '../game/road_events.js';
import { answerPressConference } from '../game/press.js';
import { openPausedDialog } from '../game/engine.js';
import { openModal, closeModal } from './modal.js';
import { showToast, addLogEntry } from './notifications.js';
import { confetti, moneyPopup, achievementBanner } from './fx.js';
import { updateStatusBar } from './statusbar.js';
import { vehicleThumbHtml } from '../three/assets.js';

function _objectiveRows(objectives) {
  return objectives.map(o => {
    const pct = Math.round((o.cur / o.target) * 100);
    const cur = o.money ? fmt.money(o.cur) : fmt.num(o.cur);
    const target = o.money ? fmt.money(o.target) : fmt.num(o.target);
    return `
      <div class="goal-row ${o.done ? 'goal-done' : ''}">
        <span class="goal-check">${o.done ? '✅' : '⬜'}</span>
        <span class="goal-label">${o.label}</span>
        <span class="goal-count">${cur} / ${target}</span>
        <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');
}

function _staticObjectives(chapter) {
  return chapter.objectives.map(o => {
    const [cur, target] = o.progress();
    return { label: o.label, cur: Math.min(cur, target), target, done: cur >= target, money: !!o.money };
  });
}

// ── Road events ──────────────────────────────────────────────
function presentRoadEvent(ev) {
  let resolved = false;
  const finish = idx => {
    if (resolved) return null;
    resolved = true;
    return resolveRoadEvent(idx);
  };

  window.chooseRoadEvent = idx => {
    const r = finish(idx);
    const choices = document.getElementById('road-event-choices');
    const out = document.getElementById('road-event-result');
    if (!r || !out) { closeModal(); return; }
    if (choices) choices.style.display = 'none';
    out.innerHTML = `
      <div class="road-event-outcome tone-${r.tone}">
        <div class="reo-text">${r.text}</div>
        ${r.lines.length ? `<div class="reo-effects">${r.lines.map(l => `<span class="reo-chip">${l}</span>`).join('')}</div>` : ''}
      </div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Weiter ▶</button></div>`;
    addLogEntry(`${ev.icon} ${ev.vehicleName}: ${r.text}`, r.tone === 'bad' ? 'warning' : 'info');
    updateStatusBar();
  };

  openPausedDialog(`${ev.icon} ${ev.title}`, () => `
    <div class="road-event">
      <div class="road-event-hero">
        <div class="road-event-thumb">${vehicleThumbHtml(ev.catalogId, `<span class="road-event-emoji">${ev.icon}</span>`, 'road-event-img')}</div>
        <div class="road-event-vehicle">📻 ${ev.vehicleName}</div>
      </div>
      <p class="road-event-text">${ev.text}</p>
      <div class="road-event-choices" id="road-event-choices">
        ${ev.choices.map((c, i) => `
          <button class="choice-btn${c.risky ? ' choice-risky' : ''}" ${c.disabled ? 'disabled' : ''} onclick="chooseRoadEvent(${i})">
            <span class="choice-label">${c.label}</span>
            <span class="choice-hint">${c.disabled ? 'Kein Mechaniker angestellt' : c.hint}</span>
          </button>`).join('')}
      </div>
      <div id="road-event-result"></div>
    </div>`, () => {
    // Closed without choosing → default choice
    const r = finish(null);
    if (r) showToast(`${ev.icon} ${ev.vehicleName}: ${r.text}`, r.tone === 'bad' ? 'warning' : 'info');
  });
}

// ── Press conferences ────────────────────────────────────────
function presentPress(pc) {
  let answered = false;
  window.answerPress = idx => {
    if (answered) return;
    answered = true;
    const r = answerPressConference(idx);
    const box = document.getElementById('press-body');
    if (!r || !box) { closeModal(); return; }
    const d = fmt.date(GS.time.day, GS.time.month, GS.time.year);
    box.innerHTML = `
      <div class="newspaper">
        <div class="np-masthead">Frankfurter Logistik-Rundschau</div>
        <div class="np-dateline">${d} · Ausgabe ${fmt.num(GS.time.totalMinutes % 9000 + 100)} · 1,50 DM</div>
        <h3 class="np-headline">„${r.headline}“</h3>
        <div class="np-effect ${r.reputationMod >= 0 ? 'np-up' : 'np-down'}">
          Unternehmensansehen ${r.reputationMod >= 0 ? '+' : '−'}${Math.abs(r.reputationMod)}
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Zeitung zuklappen</button></div>`;
    addLogEntry(`📰 Presse: „${r.headline}“ (Ansehen ${r.reputationMod >= 0 ? '+' : ''}${r.reputationMod})`, r.reputationMod >= 0 ? 'success' : 'warning');
    updateStatusBar();
  };

  openPausedDialog('🎤 Pressekonferenz', () => `
    <div id="press-body" class="press">
      <div class="press-stage">
        <span class="press-mic">${pc.icon}</span>
        <span class="press-flash">📸</span><span class="press-flash f2">📸</span>
      </div>
      <p class="press-question">„${pc.question}“</p>
      <div class="press-options">
        ${pc.options.map((o, i) => `<button class="choice-btn" onclick="answerPress(${i})"><span class="choice-label">💬 ${o.text}</span></button>`).join('')}
      </div>
    </div>`, () => {
    if (!answered) {
      answered = true;
      const r = answerPressConference(null);
      if (r) showToast(`📰 „${r.headline}“`, r.reputationMod >= 0 ? 'info' : 'warning');
    }
  });
}

// ── Campaign ─────────────────────────────────────────────────
function presentChapterIntro({ chapter, index, total }) {
  openPausedDialog(`📖 Kapitel ${index + 1} von ${total}`, () => `
    <div class="chapter">
      <h3 class="chapter-title">${chapter.title}</h3>
      <p class="chapter-story">${chapter.intro}</p>
      <div class="chapter-goals-title">🎯 Ziele</div>
      ${_objectiveRows(_staticObjectives(chapter))}
      <div class="chapter-reward">🎁 Belohnung: <strong>${fmt.money(chapter.reward)}</strong></div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Los geht’s! 🚚</button></div>
    </div>`);
}

function presentChapterComplete({ chapter, next, index, total }) {
  confetti({ count: 200 });
  addLogEntry(`🏆 ${chapter.title} abgeschlossen (+${fmt.money(chapter.reward)})`, 'success');
  openPausedDialog(next ? '🏆 Kapitel abgeschlossen!' : '👑 Kampagne gemeistert!', () => `
    <div class="chapter">
      <div class="chapter-trophy">${next ? '🏆' : '👑'}</div>
      <h3 class="chapter-title">${chapter.title}</h3>
      <p class="chapter-story">${chapter.outro}</p>
      <div class="chapter-reward big">+ ${fmt.money(chapter.reward)}</div>
      ${next ? `
        <hr class="chapter-sep">
        <div class="text-sm text-muted">Kapitel ${index + 1} von ${total}</div>
        <h3 class="chapter-title">${next.title}</h3>
        <p class="chapter-story">${next.intro}</p>
        <div class="chapter-goals-title">🎯 Ziele</div>
        ${_objectiveRows(_staticObjectives(next))}
        <div class="chapter-reward">🎁 Belohnung: <strong>${fmt.money(next.reward)}</strong></div>
      ` : `
        <p class="chapter-story">Du hast alle Kapitel gemeistert. Das Spiel läuft weiter – jage die restlichen Erfolge!</p>
        <div class="finale-stats">
          <div><strong>${fmt.num(GS.stats.ordersCompleted)}</strong><span>Aufträge</span></div>
          <div><strong>${fmt.km(Math.round(GS.stats.kmDriven))}</strong><span>gefahren</span></div>
          <div><strong>${fmt.money(GS.stats.totalRevenue)}</strong><span>Umsatz</span></div>
        </div>`}
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">${next ? 'Weiter geht’s! 🚚' : 'Weiterspielen 🎉'}</button></div>
    </div>`);
}

export function openCampaignModal() {
  const p = ensureProgressState();
  if (!isStoryMode()) {
    openModal('📖 Kampagne', '<p class="text-muted">Die Story-Kampagne ist nur im Story-Modus verfügbar. Erfolge kannst du aber auch in der Sandbox sammeln!</p>');
    return;
  }
  const status = getChapterStatus();
  const html = CHAPTERS.map((c, i) => {
    const done = i < p.chapter || p.campaignDone;
    const current = !done && i === p.chapter;
    return `
      <div class="campaign-chapter ${done ? 'cc-done' : current ? 'cc-current' : 'cc-locked'}">
        <div class="cc-head">
          <span class="cc-icon">${done ? '✅' : current ? '▶️' : '🔒'}</span>
          <span class="cc-title">${current || done ? c.title : `Kapitel ${i + 1}: ???`}</span>
          <span class="cc-reward">${fmt.money(c.reward)}</span>
        </div>
        ${current && status ? `<div class="cc-goals">${_objectiveRows(status.objectives)}</div>` : ''}
      </div>`;
  }).join('');
  openModal('📖 Story-Kampagne', `<div class="campaign">${html}</div>`);
}

// ── Achievements ─────────────────────────────────────────────
export function openAchievementsModal() {
  const p = ensureProgressState();
  const unlocked = ACHIEVEMENTS.filter(a => p.achievements[a.id]).length;
  const pct = Math.round((unlocked / ACHIEVEMENTS.length) * 100);
  const cards = ACHIEVEMENTS.map(a => {
    const got = p.achievements[a.id];
    const hidden = !got && a.secret;
    return `
      <div class="ach-card ${got ? 'ach-unlocked' : 'ach-locked'}" title="${hidden ? 'Geheimer Erfolg' : a.desc}">
        <div class="ach-icon">${hidden ? '❔' : a.icon}</div>
        <div class="ach-title">${hidden ? '???' : a.title}</div>
        <div class="ach-desc">${hidden ? 'Geheimer Erfolg' : a.desc}</div>
        ${got ? `<div class="ach-date">${fmt.date(got.day, got.month, got.year)}</div>` : ''}
      </div>`;
  }).join('');
  openModal('🏅 Erfolge', `
    <div class="ach-summary">
      <div><strong>${unlocked}</strong> / ${ACHIEVEMENTS.length} freigeschaltet</div>
      <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
      <div class="text-sm text-muted">🔥 Beste Serie: ${p.bestStreak} · 💎 Goldaufträge: ${p.goldDelivered} · 🎲 Risiken gewonnen: ${p.riskWins}</div>
    </div>
    <div class="ach-grid">${cards}</div>`);
}

// ── Registration ─────────────────────────────────────────────
export function registerDialogs() {
  registerProgressHook('road-event', presentRoadEvent);
  registerProgressHook('press', presentPress);
  registerProgressHook('chapter-intro', presentChapterIntro);
  registerProgressHook('chapter-complete', presentChapterComplete);

  let _achBatch = [];
  registerProgressHook('achievement', a => {
    addLogEntry(`🏅 Erfolg freigeschaltet: ${a.title}`, 'success');
    _achBatch.push(a);
    if (_achBatch.length > 1) return;
    setTimeout(() => {
      const batch = _achBatch;
      _achBatch = [];
      if (batch.length > 3) {
        achievementBanner('🏅', `${batch.length} Erfolge auf einmal!`, batch.map(x => x.icon).join(' '));
      } else {
        batch.forEach(x => achievementBanner(x.icon, x.title, x.desc));
      }
      confetti({ count: 80, originY: 0.15 });
    }, 0);
  });

  registerProgressHook('gold-offer', o => {
    const route = `${(DATA.CITIES.find(c => c.id === o.origin) || {}).name} → ${(DATA.CITIES.find(c => c.id === o.destination) || {}).name}`;
    showToast(`💎 <strong>Goldauftrag!</strong> ${o.clientName}: ${route} für ${fmt.money(o.value)} – nur 12 Stunden gültig!`, 'gold');
  });

  registerProgressHook('driver-levelup', ({ driver, title }) => {
    showToast(`⭐ ${driver.name} ist jetzt <strong>Stufe ${driver.skill}: ${title}</strong>!`, 'success');
  });

  registerProgressHook('streak', ({ streak, nextPct }) => {
    showToast(`🔥 ${streak} pünktliche Lieferungen in Folge! Nächster Serienbonus: +${Math.round(nextPct * 1000) / 10} %`, 'success');
  });
  registerProgressHook('streak-lost', ({ streak }) => {
    showToast(`💔 Serie von ${streak} pünktlichen Lieferungen gerissen!`, 'warning');
  });

  registerProgressHook('delivery', ({ order, onTime, amount }) => {
    moneyPopup(`+${fmt.money(amount)}`, true);
    if (order.isGold && onTime) confetti({ count: 120, colors: ['#f0c040', '#ffe08a', '#fff4cc', '#d4a017'] });
  });

  registerProgressHook('progress-changed', () => updateStatusBar());
}
