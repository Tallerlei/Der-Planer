import { $, fmt } from '../utils.js';
import { DATA } from '../data.js';
import { GS } from '../state.js';
import { TIME_COSTS } from '../constants.js';
import { addTransaction } from '../game/finance.js';
import {
  createStaff, generateHireCandidates, getDriverDailyLimit, getDriverRemainingMinutes,
  getStaffRoleStrength,
} from '../game/staff.js';
import { getDriverShiftState } from '../game/tours.js';
import { advanceGameTime } from '../game/engine.js';
import { showToast } from './notifications.js';
import { getDriverTitle, xpForNextLevel } from '../game/progression.js';
import { DRIVER_MAX_SKILL } from '../constants.js';

function _driverXpHtml(s) {
  const maxed = s.skill >= DRIVER_MAX_SKILL;
  const need = xpForNextLevel(s.skill);
  const xp = s.xp || 0;
  const pct = maxed ? 100 : Math.min(100, Math.round((xp / need) * 100));
  return `
    <div class="staff-stat">
      <span class="ss-label">Rang</span>
      <span class="driver-title driver-title-${s.skill}">${'⭐'.repeat(s.skill)} ${getDriverTitle(s.skill)}</span>
    </div>
    <div class="staff-stat driver-xp" title="${maxed ? 'Höchste Stufe erreicht' : `${xp} / ${need} XP bis Stufe ${s.skill + 1}`}">
      <span class="ss-label">Erfahrung</span>
      <div class="xp-bar"><div class="xp-bar-fill" style="width:${pct}%"></div></div>
      <span class="xp-text">${maxed ? 'MAX' : `${xp}/${need} XP`} · ${s.deliveries || 0} Lieferungen</span>
    </div>`;
}

function _roleImpactHtml() {
  const effects = [
    ['operator', '📞 Telefonzentrale', 'mehr Spotaufträge und bessere Ausschreibungswerte'],
    ['manager', '👔 Management', 'weniger Zeitkosten bei Verwaltungsaktionen'],
    ['accountant', '📊 Buchhaltung', 'niedrigere monatliche Betriebskosten'],
    ['lawyer', '⚖️ Vertragsrecht', 'geringere Strafen bei verspäteten Lieferungen'],
    ['mechanic', '🔧 Werkstatt', 'weniger Verschleiß und günstigere Instandhaltung'],
  ];
  return effects.map(([role, label, description]) => {
    const strength = getStaffRoleStrength(role);
    const pct = strength * 20;
    return `
      <div class="staff-role-impact ${strength === 0 ? 'staff-role-impact-empty' : ''}">
        <div><strong>${label}</strong><span>${description}</span></div>
        <div class="role-impact-value">${strength ? `${pct} %` : 'nicht besetzt'}</div>
      </div>`;
  }).join('');
}

function _formatDriveTime(minutes) {
  const rounded = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function renderPersonnel() {
  const listEl = $('staff-list');
  const hireEl = $('hire-list');
  if (!listEl) return;

  const roleOverview = `<div class="staff-role-overview">${_roleImpactHtml()}</div>`;
  listEl.innerHTML = roleOverview + (GS.staff.length === 0
    ? `<div class="empty-state"><div class="empty-icon">👥</div><h3>Keine Mitarbeiter</h3></div>`
    : GS.staff.map(s => {
        const role   = DATA.STAFF_ROLES[s.role];
        const dots   = Array(5).fill(0).map((_, i) =>
          `<div class="skill-dot ${i < s.skill ? 'filled' : ''}"></div>`).join('');
        const vehicle = s.vehicleId ? GS.vehicles.find(v => v.id === s.vehicleId) : null;
        return `
        <div class="staff-card">
          <div class="staff-card-header">
            <div class="staff-avatar">${role.icon}</div>
            <div class="staff-info">
              <div class="staff-name">${s.name}</div>
              <div class="staff-role">${role.label}</div>
            </div>
            <div>
              <div class="text-sm" style="text-align:right">${fmt.money(s.salary)}/Mo</div>
              <div class="badge badge-${s.satisfaction > 70 ? 'success' : s.satisfaction > 40 ? 'warning' : 'danger'}">
                😊 ${s.satisfaction}%
              </div>
            </div>
          </div>

          <div class="staff-stats">
            <div class="staff-stat">
              <span class="ss-label">Qualifikation</span>
              <div class="skill-dots">${dots}</div>
            </div>
            ${s.role === 'driver' ? _driverXpHtml(s) : ''}
            ${s.role === 'driver' ? `
              <div class="staff-stat">
                <span class="ss-label">Aktuelle Schicht</span>
                <span class="ss-value">${_formatDriveTime(s.drivingMinutesToday)} / ${_formatDriveTime(getDriverDailyLimit(s))}</span>
                <span class="staff-shift-remaining ${getDriverRemainingMinutes(s) < 120 ? 'text-danger' : ''}">
                  ${getDriverShiftState(s).resting
                    ? `ruht noch ${_formatDriveTime(getDriverShiftState(s).restUntilMinute - GS.time.totalMinutes)}`
                    : `noch ${_formatDriveTime(getDriverRemainingMinutes(s))}`}
                </span>
              </div>` : ''}
            ${vehicle ? `<div class="staff-stat"><span class="ss-label">Fahrzeug</span><span class="ss-value">${vehicle.name}</span></div>` : ''}
            ${s.certifications.length ? `
            <div class="staff-stat">
              <span class="ss-label">Zertifikate</span>
              <div class="certs">${s.certifications.map(c => `<span class="cert-badge">${c}</span>`).join('')}</div>
            </div>` : ''}
          </div>

          <div class="flex gap-sm">
            <button class="btn btn-warning btn-sm" title="Einmalbonus zahlen und Zufriedenheit erhöhen"
              onclick="giveStaffBonus('${s.id}')">+ Zufriedenheit</button>
            <button class="btn btn-danger btn-sm" title="Entlassen: +${TIME_COSTS.fireStaff} Min" onclick="fireStaff('${s.id}')">Entlassen</button>
          </div>
        </div>`;
      }).join(''));

  if (!hireEl) return;
  if (GS.hireCandidates.length === 0) generateHireCandidates();

  hireEl.innerHTML = GS.hireCandidates.map(c => {
    const role = DATA.STAFF_ROLES[c.role];
    const dots = Array(5).fill(0).map((_,i) =>
      `<div class="skill-dot ${i < c.skill ? 'filled' : ''}"></div>`).join('');
    return `
    <div class="hire-card">
      <div class="hire-icon">${role.icon}</div>
      <div class="hire-info">
        <div class="hire-name">${c.name}</div>
        <div class="hire-details">${role.label}${c.role === 'driver' ? ` „${getDriverTitle(c.skill)}“` : ''} · Qualifikation: <div class="skill-dots" style="display:inline-flex">${dots}</div></div>
        ${c.certifications.length ? `<div class="hire-details">Zertifikate: ${c.certifications.join(', ')}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="text-sm font-bold">${fmt.money(c.salary)}/Mo</div>
        <button class="btn btn-success btn-sm mt-sm" title="Einstellen: +${TIME_COSTS.hireStaff} Min" onclick="hireStaff('${c.id}')">Einstellen</button>
      </div>
    </div>`;
  }).join('');
}

export function fireStaff(staffId) {
  const s = GS.staff.find(x => x.id === staffId);
  if (!s) return;
  if (s.vehicleId) {
    const v = GS.vehicles.find(v => v.id === s.vehicleId);
    if (v && v.status === 'driving') {
      showToast('Fahrer kann nicht entlassen werden – ist noch unterwegs!', 'danger');
      return;
    }
    if (v) v.driverId = null;
  }
  const severance = s.salary;
  addTransaction(`Abfindung: ${s.name}`, -severance);
  GS.staff = GS.staff.filter(x => x.id !== staffId);
  showToast(`${s.name} entlassen.`, 'warning');
  advanceGameTime(TIME_COSTS.fireStaff, 'Entlassung');
  renderPersonnel();
}

export function hireStaff(candidateId) {
  const c = GS.hireCandidates.find(x => x.id === candidateId);
  if (!c) return;
  GS.staff.push(c);
  GS.hireCandidates = GS.hireCandidates.filter(x => x.id !== candidateId);
  showToast(`${c.name} eingestellt!`, 'success');
  advanceGameTime(TIME_COSTS.hireStaff, 'Einstellung');
  renderPersonnel();
}

export function giveStaffBonus(staffId) {
  const staff = GS.staff.find(item => item.id === staffId);
  if (!staff) return;
  const cost = Math.round(staff.salary * 0.25);
  if (GS.finance.balance < cost) {
    showToast('Das Bonusbudget reicht nicht aus.', 'danger');
    return;
  }
  addTransaction(`Mitarbeiterbonus: ${staff.name}`, -cost);
  staff.satisfaction = Math.min(100, (staff.satisfaction ?? 70) + 20);
  staff.resignationWarning = false;
  showToast(`${staff.name} freut sich über ${fmt.money(cost)} Bonus.`, 'success');
  renderPersonnel();
}
