import { DATA } from '../data.js';
import { GS } from '../state.js';
import { uid, rand, pick } from '../utils.js';

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
  };
}

export function generateHireCandidates() {
  GS.hireCandidates = [];
  const roles = Object.keys(DATA.STAFF_ROLES);
  for (let i = 0; i < 8; i++) {
    const role = pick(roles);
    GS.hireCandidates.push(createStaff(role, rand(1, 5)));
  }
}
