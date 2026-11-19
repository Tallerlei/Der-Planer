import { $ } from '../utils.js';

const _reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CONFETTI_COLORS = ['#ff4a68', '#4da3ff', '#3fb950', '#f0c040', '#c678dd', '#ffffff'];

/** Fires a short confetti burst on a full-screen overlay canvas. */
export function confetti({ count = 140, colors = CONFETTI_COLORS, originY = 0.35 } = {}) {
  if (_reducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width  = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = window.innerWidth, H = window.innerHeight;
  const parts = Array.from({ length: count }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3,
    y: H * originY,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 14 - 4,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  const start = performance.now();
  const DURATION = 3200;
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION * 0.6) / (DURATION * 0.4));
    for (const p of parts) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

/** Shows a floating "+1.234 €" next to the balance in the status bar. */
export function moneyPopup(text, positive = true) {
  const anchor = $('sb-money');
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = `fx-money-popup ${positive ? 'fx-positive' : 'fx-negative'}`;
  el.textContent = text;
  el.style.left = `${r.left}px`;
  el.style.top  = `${r.bottom + 4}px`;
  document.body.appendChild(el);
  anchor.classList.remove('fx-bump');
  void anchor.offsetWidth;
  anchor.classList.add('fx-bump');
  setTimeout(() => el.remove(), 1800);
}

// ── Achievement banners (queued so they never overlap) ───────
const _bannerQueue = [];
let _bannerActive = false;

export function achievementBanner(icon, title, subtitle) {
  _bannerQueue.push({ icon, title, subtitle });
  _nextBanner();
}

function _nextBanner() {
  if (_bannerActive || _bannerQueue.length === 0) return;
  _bannerActive = true;
  const { icon, title, subtitle } = _bannerQueue.shift();
  const el = document.createElement('div');
  el.className = 'fx-banner';
  el.innerHTML = `
    <div class="fx-banner-icon">${icon}</div>
    <div class="fx-banner-text">
      <div class="fx-banner-kicker">🏅 Erfolg freigeschaltet!</div>
      <div class="fx-banner-title">${title}</div>
      <div class="fx-banner-sub">${subtitle}</div>
    </div>`;
  el.addEventListener('click', () => { if (typeof window.openAchievementsModal === 'function') window.openAchievementsModal(); });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.remove(); _bannerActive = false; _nextBanner(); }, 400);
  }, 3800);
}
