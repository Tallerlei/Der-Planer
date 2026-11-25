import { DATA } from '../data.js';
import { GS } from '../state.js';
import { uid, rand, pick } from '../utils.js';
import {
  DRIVER_BASE_MINUTES_PER_DAY,
  DRIVER_EXTRA_MINUTES_PER_SKILL,
} from '../constants.js';

export function randomName() {
  const isMale = Math.random() > 0.45;
  const first = isMale
    ? pick(DATA.FIRST_NAMES_M)
    : pick(DATA.FIRST_NAMES_F);
  const last = pick(DATA.LAST_NAMES);
  return `${first} ${last}`;
}

export function createStaff(role, skill) {
  const roleInfo = DATA.STAFF_ROLES[role];
  skill = skill || rand(1, 4);
  const salaryVariance = (skill - 2) * 200;
  const certs = [];
  if (role === 'driver') {
    certs.push('CE');
    if (Math.random() < 0.3) certs.push('ADR');
  }
  return {
    id: uid(),
    name: randomName(),
    role,
    skill,
    salary: roleInfo.baseSalary + salaryVariance,
    satisfaction: rand(65, 90),
    certifications: certs,
    vehicleId: null,
    hiredAt: { ...GS.time },
    xp: 0,
    deliveries: 0,
    drivingMinutesToday: 0,
    restUntilMinute: null,
    loyaltyMonths: 0,
    resignationWarning: false,
  };
}

export function getStaffRoleStrength(role) {
  return (GS.staff || [])
    .filter(staff => staff.role === role)
    .reduce((best, staff) => Math.max(best, Math.max(1, Math.min(5, staff.skill || 1))), 0);
}

export function getRoleEffect(role) {
  const strength = getStaffRoleStrength(role);
  return strength === 0 ? 0 : strength / 5;
}

export function getActionTimeMultiplier() {
  return 1 - Math.min(0.3, getRoleEffect('manager') * 0.3);
}

export function getPenaltyMultiplier() {
  return 1 - Math.min(0.4, getRoleEffect('lawyer') * 0.4);
}

export function getMonthlyCostMultiplier() {
  return 1 - Math.min(0.18, getRoleEffect('accountant') * 0.18);
}

export function getOperatorTenderBonus() {
  return Math.round(getRoleEffect('operator') * 20);
}

export function getDriverDailyLimit(driver) {
  if (!driver) return 0;
  return DRIVER_BASE_MINUTES_PER_DAY
    + Math.max(0, (driver.skill || 1) - 1) * DRIVER_EXTRA_MINUTES_PER_SKILL;
}

export function getDriverRemainingMinutes(driver) {
  return Math.max(0, getDriverDailyLimit(driver) - (driver?.drivingMinutesToday || 0));
}

export function getDriverByVehicle(vehicle) {
  return vehicle?.driverId
    ? (GS.staff || []).find(staff => staff.id === vehicle.driverId) || null
    : null;
}

export function driverMeetsRequirements(driver, requirements = []) {
  if (!requirements.includes('adr')) return true;
  if (!driver) return false;
  if (!(driver.certifications || []).includes('ADR')) return false;
  return true;
}

export function getDriverPerformanceFactor(driver) {
  if (!driver) return 1;
  const satisfaction = Math.max(0, Math.min(100, driver.satisfaction ?? 70));
  return 0.86 + satisfaction / 500;
}

export function migrateStaffState() {
  for (const staff of GS.staff || []) {
    staff.skill = Math.max(1, Math.min(5, staff.skill || 1));
    staff.satisfaction = Math.max(0, Math.min(100, staff.satisfaction ?? 70));
    staff.certifications ??= [];
    staff.drivingMinutesToday ??= 0;
    staff.loyaltyMonths ??= 0;
    staff.resignationWarning ??= false;
    staff.restUntilMinute ??= null;
  }
}

export function resetDriverDailyMinutes(driver = null) {
  for (const staff of GS.staff || []) {
    if (staff.role !== 'driver') continue;
    if (driver && staff.id !== driver.id) continue;
    staff.drivingMinutesToday = 0;
    staff.restUntilMinute = null;
  }
}

export function generateHireCandidates() {
  GS.hireCandidates = [];
  const roles = Object.keys(DATA.STAFF_ROLES);
  for (let i = 0; i < 8; i++) {
    const role = pick(roles);
    GS.hireCandidates.push(createStaff(role, rand(1, 5)));
  }
}
