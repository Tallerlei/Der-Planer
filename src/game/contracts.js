import { GS, getCityName } from '../state.js';
import { DATA } from '../data.js';
import { fmt, pick, uid, rand } from '../utils.js';

const DEFAULT_PERIOD_MINUTES = 7 * 1440;

export const CONTRACT_TEMPLATES = [
  {
    id: 'fresh_food',
    clientId: 'c01',
    title: 'Frischeland-Linie',
    origin: 'frankfurt',
    destination: 'hamburg',
    cargoDesc: 'Frischwaren (Vertragsladung)',
    cargoType: 'food',
    weight: 2000,
    requirements: [],
    value: 2800,
    bonus: 420,
    penalty: 600,
    periodMinutes: DEFAULT_PERIOD_MINUTES,
    deadlineMinutes: 2 * 1440,
    minRep: 0,
    maxMisses: 3,
  },
  {
    id: 'pharma_express',
    clientId: 'c11',
    title: 'Pharma Nord Express',
    origin: 'hamburg',
    destination: 'muenchen',
    cargoDesc: 'Temperaturgeführte Medikamente',
    cargoType: 'medical',
    weight: 5000,
    requirements: ['cooling'],
    value: 6100,
    bonus: 1250,
    penalty: 1800,
    periodMinutes: 5 * 1440,
    deadlineMinutes: 36 * 60,
    minRep: 30,
    maxMisses: 2,
  },
  {
    id: 'chemical_chain',
    clientId: 'c03',
    title: 'Nordsee-Chemiekette',
    origin: 'hamburg',
    destination: 'koeln',
    cargoDesc: 'Chemiecontainer nach ADR',
    cargoType: 'hazmat',
    weight: 12000,
    requirements: ['adr'],
    value: 5800,
    bonus: 1100,
    penalty: 1400,
    periodMinutes: 4 * 1440,
    deadlineMinutes: 42 * 60,
    minRep: 40,
    maxMisses: 2,
  },
  {
    id: 'paper_loop',
    clientId: 'c13',
    title: 'Papierkreislauf Ost',
    origin: 'leipzig',
    destination: 'koeln',
    cargoDesc: 'Papierrollen (Rahmenvertrag)',
    cargoType: 'general',
    weight: 9000,
    requirements: [],
    value: 4700,
    bonus: 650,
    penalty: 900,
    periodMinutes: 7 * 1440,
    deadlineMinutes: 3 * 1440,
    minRep: 20,
    maxMisses: 3,
  },
  {
    id: 'machine_parts',
    clientId: 'c25',
    title: 'SportGear Werkbank',
    origin: 'muenchen',
    destination: 'berlin',
    cargoDesc: 'Maschinen- und Sportkomponenten',
    cargoType: 'auto',
    weight: 16000,
    requirements: [],
    value: 7200,
    bonus: 1350,
    penalty: 1600,
    periodMinutes: 6 * 1440,
    deadlineMinutes: 2 * 1440,
    minRep: 50,
    maxMisses: 2,
  },
];

const BID_STRATEGIES = {
  aggressive: { label: 'Aggressiv', factor: 0.88, baseWinChance: 0.72 },
  balanced: { label: 'Ausgeglichen', factor: 1, baseWinChance: 0.5 },
  premium: { label: 'Premium', factor: 1.13, baseWinChance: 0.27 },
};

export { BID_STRATEGIES };

function _clientName(clientId) {
  return DATA.CLIENTS.find(client => client.id === clientId)?.name || 'Unbekannter Kunde';
}

export function createContractFromTemplate(template, releaseMinute, bidFactor = 1) {
  return {
    ...template,
    id: `contract-${uid()}`,
    contractTemplateId: template.id,
    clientName: _clientName(template.clientId),
    industry: DATA.CLIENTS.find(client => client.id === template.clientId)?.industry || template.cargoType,
    value: Math.round(template.value * bidFactor),
    bidFactor,
    releaseMinute,
    nextReleaseMinute: releaseMinute,
    active: true,
    renewals: 0,
    deliveries: 0,
    onTimeDeliveries: 0,
    missedDeliveries: 0,
  };
}

export function createStarterContract(releaseMinute) {
  return {
    ...createContractFromTemplate(CONTRACT_TEMPLATES[0], releaseMinute),
    id: 'contract-mueller-weekly',
  };
}

export function ensureContracts() {
  if (!Array.isArray(GS.contracts)) GS.contracts = [];
  for (const contract of GS.contracts) {
    contract.periodMinutes ??= DEFAULT_PERIOD_MINUTES;
    contract.deadlineMinutes ??= 2 * 1440;
    contract.maxMisses ??= 3;
    contract.deliveries ??= 0;
    contract.onTimeDeliveries ??= 0;
    contract.missedDeliveries ??= 0;
    contract.renewals ??= 0;
    contract.active ??= true;
    contract.requirements ??= [];
  }
  return GS.contracts;
}

export function ensureTenders() {
  if (!Array.isArray(GS.tenders)) GS.tenders = [];
  return GS.tenders;
}

export function getContractById(contractId) {
  return ensureContracts().find(contract => contract.id === contractId) || null;
}

export function isContractActive(contract) {
  return !!contract
    && contract.active !== false
    && contract.missedDeliveries < (contract.maxMisses || 3);
}

export function getContractReliability(contract) {
  if (!contract || contract.deliveries + contract.missedDeliveries === 0) return 100;
  const lateDeliveries = Math.max(0, contract.deliveries - contract.onTimeDeliveries);
  const expiredLoads = Math.max(0, contract.missedDeliveries - lateDeliveries);
  return Math.round(contract.onTimeDeliveries / (contract.deliveries + expiredLoads) * 100);
}

export function getContractSummary(contract) {
  if (!contract) return '';
  return `${contract.title}: ${getCityName(contract.origin)} → ${getCityName(contract.destination)} · ${fmt.weight(contract.weight)} · alle ${Math.round(contract.periodMinutes / 1440)} Tage`;
}

export function buildContractOrder(contract, receivedMinute, receivedAt) {
  if (!isContractActive(contract)) return null;
  return {
    id: uid(),
    clientId: contract.clientId,
    clientName: contract.clientName,
    industry: contract.industry || DATA.CLIENTS.find(client => client.id === contract.clientId)?.industry || 'general',
    origin: contract.origin,
    destination: contract.destination,
    cargoDesc: contract.cargoDesc,
    cargoType: contract.cargoType,
    weight: contract.weight,
    remainingWeight: contract.weight,
    tripsCompleted: 0,
    requirements: [...contract.requirements],
    value: contract.value,
    penalty: contract.penalty,
    bonus: contract.bonus,
    deadlineDays: contract.deadlineMinutes / 1440,
    expiresInDays: contract.deadlineMinutes / 1440,
    isUrgent: false,
    urgencyFactor: 1,
    freightFactor: 1.1,
    pricePerKm: null,
    receivedMinute,
    receivedAt,
    channel: 'contract',
    status: 'available',
    vehicleId: null,
    acceptedMinute: null,
    acceptedAt: null,
    pickedUpAt: null,
    completedMinute: null,
    completedAt: null,
    expiredAt: null,
    finalValue: null,
    isContract: true,
    contractId: contract.id,
  };
}

export function advanceContractRelease(contract) {
  contract.nextReleaseMinute += contract.periodMinutes || DEFAULT_PERIOD_MINUTES;
  return contract.nextReleaseMinute;
}

export function recordContractFailure(contract) {
  if (!contract) return;
  contract.missedDeliveries++;
  if (contract.missedDeliveries >= (contract.maxMisses || 3)) contract.active = false;
}

export function recordContractDelivery(contract, onTime) {
  if (!contract) return 0;
  contract.deliveries++;
  if (onTime) contract.onTimeDeliveries++;
  if (!onTime) {
    recordContractFailure(contract);
    contract.missedDeliveries = Math.max(0, contract.missedDeliveries);
  }
  if (contract.deliveries > 0 && contract.deliveries % 4 === 0 && onTime) {
    contract.renewals++;
    contract.value = Math.round(contract.value * 1.05);
    return Math.round(contract.value * 0.5);
  }
  return 0;
}

export function generateContractTender(now = GS.time.totalMinutes) {
  const available = CONTRACT_TEMPLATES.filter(template =>
    template.id !== 'fresh_food' &&
    template.minRep <= (GS.company.reputation || 50) &&
    !ensureContracts().some(contract =>
      contract.contractTemplateId === template.id && isContractActive(contract)
    ) &&
    !ensureTenders().some(tender =>
      tender.templateId === template.id && tender.status === 'open'
    )
  );
  if (available.length === 0) return null;
  const template = pick(available);
  const competitor = pick(['Brummer & Söhne', 'Nordstern Logistik', 'RheinCargo', 'TransEuropa GmbH']);
  const tender = {
    id: uid(),
    templateId: template.id,
    title: template.title,
    clientId: template.clientId,
    clientName: _clientName(template.clientId),
    route: `${getCityName(template.origin)} → ${getCityName(template.destination)}`,
    cargo: template.cargoDesc,
    requirements: [...template.requirements],
    weight: template.weight,
    baseValue: template.value,
    competitor,
    competitorFactor: rand(92, 108) / 100,
    receivedMinute: now,
    expiresMinute: now + 2 * 1440,
    minRep: template.minRep,
    status: 'open',
  };
  ensureTenders().push(tender);
  return tender;
}

export function getTenderClientId(tender) {
  return tender?.clientId || CONTRACT_TEMPLATES.find(item => item.id === tender?.templateId)?.clientId || null;
}

/** Marks overdue open tenders as expired and returns the newly expired ones. */
export function expireTenders() {
  const now = GS.time.totalMinutes;
  const expired = [];
  for (const tender of ensureTenders()) {
    if (tender.status === 'open' && tender.expiresMinute < now) {
      tender.status = 'expired';
      expired.push(tender);
    }
  }
  return expired;
}

export function declineTender(tenderId) {
  const tender = ensureTenders().find(item => item.id === tenderId);
  if (!tender || tender.status !== 'open') return null;
  tender.status = 'declined';
  tender.declinedMinute = GS.time.totalMinutes;
  return tender;
}

export function getTenderWinChance(tender, strategyId, operatorBonus = 0) {
  const strategy = BID_STRATEGIES[strategyId];
  if (!tender || !strategy) return 0;
  const reputationBonus = Math.max(-0.12, Math.min(0.18, ((GS.company.reputation || 50) - 50) / 250));
  const marketAdvantage = Math.max(-0.12, Math.min(0.12, tender.competitorFactor - strategy.factor));
  const difficulty = DATA.DIFFICULTY[GS.company.difficulty] || DATA.DIFFICULTY.normal;
  const competitionPenalty = ((difficulty.competitorActivity ?? 0.7) - 0.7) * 0.25;
  return Math.max(
    0.08,
    Math.min(0.9, strategy.baseWinChance + reputationBonus + marketAdvantage + operatorBonus / 100 - competitionPenalty)
  );
}

export function submitTenderBid(tenderId, strategyId, rng = Math.random, operatorBonus = 0) {
  const tender = ensureTenders().find(item => item.id === tenderId);
  const strategy = BID_STRATEGIES[strategyId];
  if (!tender || tender.status !== 'open' || !strategy) {
    return { ok: false, reason: 'Angebot ist nicht mehr verfügbar.' };
  }

  const factor = strategy.factor;
  const chance = getTenderWinChance(tender, strategyId, operatorBonus);
  const won = rng() < chance;
  tender.status = won ? 'won' : 'lost';
  tender.bidFactor = factor;
  tender.winChance = chance;

  let contract = null;
  if (won) {
    const template = CONTRACT_TEMPLATES.find(item => item.id === tender.templateId);
    if (!template) return { ok: false, reason: 'Vertragstyp nicht mehr verfügbar.' };
    contract = createContractFromTemplate(template, GS.time.totalMinutes, factor);
    ensureContracts().push(contract);
  }
  return { ok: true, won, chance, factor, contract, tender };
}
