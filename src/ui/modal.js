import { $ } from '../utils.js';
import { GS } from '../state.js';
import { fmt } from '../utils.js';

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
