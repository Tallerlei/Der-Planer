import { $ } from '../utils.js';
import { GS } from '../state.js';
import { fmt } from '../utils.js';
import { DATA } from '../data.js';
import { getReputationTier } from '../game/orders.js';

let _onCloseCallback = null;

export function openModal(title, bodyHtml, onClose = null) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML   = bodyHtml;
  $('modal-overlay').classList.add('open');
  _onCloseCallback = onClose;
}

export function closeModal() {
  $('modal-overlay').classList.remove('open');
  if (_onCloseCallback) {
    const cb = _onCloseCallback;
    _onCloseCallback = null;
    cb();
  }
}

export function openEventsModal() {
  const html = GS.market.activeEvents.length === 0
    ? '<div class="text-muted text-sm">Keine aktiven Marktereignisse.</div>'
    : GS.market.activeEvents.map(e =>
        `<div class="event-card">
           <strong>${e.title}</strong>
           <div class="text-sm text-muted mt-sm">Noch ${e.remainingDays} Tage aktiv</div>
         </div>`
      ).join('');
  openModal('Markt & Ereignisse', html);
}

export function openSettingsModal() {
  const html = `
    <div class="flex flex-col gap-md">
      <button class="btn btn-secondary" onclick="autoSave();showToast('Gespeichert!','success')">💾 Manuell speichern</button>
      <button class="btn btn-danger"    onclick="if(confirm('Wirklich neu starten?')){deleteSave();location.reload()}">🗑️ Spielstand löschen & neu starten</button>
    </div>`;
  openModal('Einstellungen', html);
}

export function openStatsModal() {
  const html = `
    <div class="table-wrap">
      <table>
        <tr><th>Statistik</th><th>Wert</th></tr>
        <tr><td>Aufträge abgeschlossen</td><td>${GS.stats.ordersCompleted}</td></tr>
        <tr><td>Aufträge fehlgeschlagen</td><td>${GS.stats.ordersFailed}</td></tr>
        <tr><td>Gesamtumsatz</td><td>${fmt.money(GS.stats.totalRevenue)}</td></tr>
        <tr><td>Gesamtkosten</td><td>${fmt.money(GS.stats.totalExpenses)}</td></tr>
        <tr><td>Kilometer gefahren</td><td>${fmt.km(Math.round(GS.stats.kmDriven))}</td></tr>
        <tr><td>Mitarbeiter</td><td>${GS.staff.length}</td></tr>
        <tr><td>Fahrzeuge</td><td>${GS.vehicles.length}</td></tr>
        <tr><td>Ansehen</td><td>${GS.company.reputation || 50} / 100</td></tr>
      </table>
    </div>`;
  openModal('Unternehmensstatistik', html);
}

export function openLogModal() {
  const entries = GS.messageLog.slice().reverse();
  const html = entries.length === 0
    ? '<div class="text-muted text-sm">Noch keine Meldungen aufgezeichnet.</div>'
    : `<div class="log-list">${entries.map(e => {
        const time = `${fmt.date(e.t.day, e.t.month, e.t.year)} ${fmt.time(e.t.hour, e.t.minute)}`;
        return `<div class="log-entry log-${e.type}">
          <span class="log-time">${time}</span>
          <span class="log-msg">${e.msg}</span>
        </div>`;
      }).join('')}</div>`;
  openModal('📋 Meldungsprotokoll', html);
}

// ── Reputation Dashboard ─────────────────────────────────────

/** Returns {stars, cssClass} for the 5-band visual reputation indicator. */
function _repDisplay(rep) {
  if (rep <= 20) return { stars: '★☆☆☆☆', cssClass: 'rep-very-low' };
  if (rep <= 40) return { stars: '★★☆☆☆', cssClass: 'rep-low' };
  if (rep <= 60) return { stars: '★★★☆☆', cssClass: 'rep-mid' };
  if (rep <= 80) return { stars: '★★★★☆', cssClass: 'rep-high' };
  return { stars: '★★★★★', cssClass: 'rep-very-high' };
}

/** Returns a German description of the concrete effect of the current company reputation tier. */
function _companyRepEffect(tier) {
  const effects = {
    1: 'Sehr schlecht: Maximale Auftragsgröße 3.000 kg. Kaum Aufträge verfügbar.',
    2: 'Niedrig: Maximale Auftragsgröße 8.000 kg.',
    3: 'Mittel: Maximale Auftragsgröße 15.000 kg.',
    4: 'Gut: Maximale Auftragsgröße 26.000 kg. Große Aufträge verfügbar.',
    5: 'Sehr gut: Keine Gewichtsbeschränkung. Alle Auftragsgrößen verfügbar.',
  };
  return effects[tier] || '';
}

/** Returns a German description of the effect of a client reputation value. */
function _clientRepEffect(rep) {
  if (rep <= 20) return 'Sehr schlecht: Selten Aufträge. Reputation dringend verbessern.';
  if (rep <= 40) return 'Niedrig: Gelegentliche Aufträge. Kein Loyalitätsbonus.';
  if (rep <= 60) return 'Mittel: Regelmäßige Aufträge. Kein Loyalitätsbonus.';
  if (rep < 75)  return 'Gut: Häufige Aufträge. Fast Loyalitätsschwelle (75).';
  if (rep <= 80) return 'Gut: Häufige Aufträge. +5 % Vergütungsbonus aktiv.';
  return 'Sehr gut: Exklusivaufträge möglich. +5 % Vergütungsbonus aktiv.';
}

/** Builds a small SVG sparkline for the last N history entries.
 *  @param {Array}   history  – GS.reputationHistory entries
 *  @param {string|null} clientId – null for company rep, string for client rep
 */
function _sparkline(history, clientId) {
  const MAX_POINTS = 20;
  const entries = history.slice(-MAX_POINTS);
  if (entries.length < 2) return '<span class="text-muted" style="font-size:0.7rem">–</span>';

  const values = entries.map(p =>
    clientId !== null
      ? (p.clients && p.clients[clientId] !== undefined ? p.clients[clientId] : 50)
      : p.company
  );

  const W = 90, H = 22;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - minV) / range) * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const trend = values[values.length - 1] - values[0];
  const color = trend > 1 ? '#3fb950' : trend < -1 ? '#f85149' : '#8b949e';

  return `<svg width="${W}" height="${H}" class="rep-sparkline" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/** Returns a trend arrow HTML string based on recent history. */
function _trendArrow(history, clientId) {
  const last = history.slice(-5);
  if (last.length < 2) return '';
  const vals = last.map(p =>
    clientId !== null
      ? (p.clients && p.clients[clientId] !== undefined ? p.clients[clientId] : 50)
      : p.company
  );
  const diff = vals[vals.length - 1] - vals[0];
  if (diff > 1)  return '<span class="rep-trend rep-trend-up" title="Steigend">▲</span>';
  if (diff < -1) return '<span class="rep-trend rep-trend-down" title="Fallend">▼</span>';
  return '<span class="rep-trend rep-trend-stable" title="Stabil">–</span>';
}

export function openReputationDashboard() {
  const companyRep  = GS.company.reputation || 50;
  const tier        = getReputationTier(companyRep);
  const { stars: cStars, cssClass: cClass } = _repDisplay(companyRep);
  const history     = GS.reputationHistory || [];

  const companySection = `
    <div class="rep-dashboard-section">
      <div class="rep-dashboard-section-title">🏢 Unternehmensansehen</div>
      <div class="rep-row">
        <span class="client-rep-badge ${cClass}" title="${companyRep} / 100">${cStars}</span>
        <div class="rep-bar-wrap">
          <div class="rep-bar-fill ${cClass}" style="width:${companyRep}%"></div>
        </div>
        <span class="rep-value ${cClass}">${companyRep}&nbsp;/&nbsp;100</span>
        <span class="rep-tier-pill">Stufe&nbsp;${tier}</span>
        ${_trendArrow(history, null)}
      </div>
      <div class="rep-sparkline-row">${_sparkline(history, null)}<span class="rep-sparkline-label">30-Tage-Verlauf</span></div>
      <div class="rep-effect-text">${_companyRepEffect(tier)}</div>
    </div>`;

  // Build per-client rows
  const clientRep = GS.clientReputation || {};
  const knownIds  = Object.keys(clientRep);

  let clientSection;
  if (knownIds.length === 0) {
    clientSection = `
      <div class="rep-dashboard-section">
        <div class="rep-dashboard-section-title">🤝 Kundenansehen</div>
        <div class="text-muted text-sm rep-no-clients">
          Noch kein Kontakt zu Auftraggebern. Nimm Aufträge an, um Kundenbeziehungen aufzubauen.
        </div>
      </div>`;
  } else {
    const clientMap = {};
    DATA.CLIENTS.forEach(c => { clientMap[c.id] = c; });

    const rows = knownIds
      .sort((a, b) => clientRep[b] - clientRep[a])
      .map(id => {
        const rep    = clientRep[id];
        const client = clientMap[id];
        const name   = client ? client.name : id;
        const { stars, cssClass } = _repDisplay(rep);
        const stats  = (GS.clientStats || {})[id] || { completed: 0, failed: 0 };
        const sparkHtml = _sparkline(history, id);
        const arrow     = _trendArrow(history, id);
        const effectText = _clientRepEffect(rep);
        const warnClass = rep <= 10 ? 'rep-row-danger' : rep <= 25 ? 'rep-row-warning' : '';
        return `
          <div class="rep-client-row ${warnClass}">
            <div class="rep-client-header">
              <span class="rep-client-name">${name}</span>
              <span class="client-rep-badge ${cssClass}">${stars}</span>
              ${arrow}
            </div>
            <div class="rep-row">
              <div class="rep-bar-wrap">
                <div class="rep-bar-fill ${cssClass}" style="width:${rep}%"></div>
              </div>
              <span class="rep-value ${cssClass}">${rep}&nbsp;/&nbsp;100</span>
              ${sparkHtml}
            </div>
            <div class="rep-client-meta">
              <span class="text-muted rep-client-stats">✅ ${stats.completed} &nbsp; ❌ ${stats.failed}</span>
              <span class="rep-effect-text-sm">${effectText}</span>
            </div>
          </div>`;
      }).join('');

    clientSection = `
      <div class="rep-dashboard-section">
        <div class="rep-dashboard-section-title">🤝 Kundenansehen</div>
        ${rows}
      </div>`;
  }

  openModal('🏆 Ansehen-Übersicht', `<div class="rep-dashboard">${companySection}${clientSection}</div>`);
}
