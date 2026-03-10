import { $, fmt } from '../utils.js';
import { DATA } from '../data.js';
import { GS } from '../state.js';
import { TIME_COSTS } from '../constants.js';
import { addTransaction } from '../game/finance.js';
import { createStaff, generateHireCandidates } from '../game/staff.js';
import { advanceGameTime } from '../game/engine.js';
import { showToast } from './notifications.js';

export function renderPersonnel() {
  const listEl = $('staff-list');
  const hireEl = $('hire-list');
  if (!listEl) return;

  listEl.innerHTML = GS.staff.length === 0
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
            ${vehicle ? `<div class="staff-stat"><span class="ss-label">Fahrzeug</span><span class="ss-value">${vehicle.name}</span></div>` : ''}
            ${s.certifications.length ? `
            <div class="staff-stat">
              <span class="ss-label">Zertifikate</span>
              <div class="certs">${s.certifications.map(c => `<span class="cert-badge">${c}</span>`).join('')}</div>
            </div>` : ''}
          </div>

          <div class="flex gap-sm">
            <button class="btn btn-danger btn-sm" title="Entlassen: +${TIME_COSTS.fireStaff} Min" onclick="fireStaff('${s.id}')">Entlassen</button>
          </div>
        </div>`;
      }).join('');

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
        <div class="hire-details">${role.label} · Qualifikation: <div class="skill-dots" style="display:inline-flex">${dots}</div></div>
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
