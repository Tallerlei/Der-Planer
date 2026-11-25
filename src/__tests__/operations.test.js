import { beforeEach, describe, expect, it } from 'vitest';
import { GS } from '../state.js';
import {
  getActionTimeMultiplier, getDriverDailyLimit, getDriverPerformanceFactor,
  getMonthlyCostMultiplier, getPenaltyMultiplier, getStaffRoleStrength,
} from '../game/staff.js';
import { getVehicleConditionFactor, getVehicleFuelConditionFactor, getVehicleWearPerKm } from '../game/vehicles.js';
import {
  CONTRACT_TEMPLATES, BID_STRATEGIES, createContractFromTemplate, ensureContracts,
  getContractReliability, recordContractDelivery, submitTenderBid,
} from '../game/contracts.js';
import { projectDrivingSegments } from '../game/tours.js';

beforeEach(() => {
  GS.company = { reputation: 50 };
  GS.staff = [];
  GS.contracts = [];
  GS.tenders = [];
  GS.time = { totalMinutes: 0 };
});

describe('operational staff effects', () => {
  it('uses the strongest employee of each role rather than stacking duplicate hires', () => {
    GS.staff = [
      { role: 'manager', skill: 2 },
      { role: 'manager', skill: 5 },
      { role: 'operator', skill: 3 },
    ];
    expect(getStaffRoleStrength('manager')).toBe(5);
    expect(getActionTimeMultiplier()).toBe(0.7);
  });

  describe('driver shift projection', () => {
    it('adds an eleven-hour rest once remaining shift time is exhausted', () => {
      const driver = {
        skill: 2,
        drivingMinutesToday: 540,
        restUntilMinute: null,
      };
      const projection = projectDrivingSegments(driver, 1000, 100);

      expect(projection.rests).toHaveLength(1);
      expect(projection.rests[0]).toEqual({
        startMinute: 1030,
        endMinute: 1690,
        duration: 660,
      });
      expect(projection.endMinute).toBe(1760);
    });
  });

  it('connects satisfaction and skill to driver capacity and performance', () => {
    const driver = { role: 'driver', skill: 3, satisfaction: 100 };
    expect(getDriverDailyLimit(driver)).toBe(10 * 60);
    expect(getDriverPerformanceFactor(driver)).toBe(1.06);
  });

  it('applies accountant and lawyer bonuses without making staff free', () => {
    GS.staff = [
      { role: 'accountant', skill: 5 },
      { role: 'lawyer', skill: 5 },
    ];
    expect(getMonthlyCostMultiplier()).toBeGreaterThan(0.8);
    expect(getPenaltyMultiplier()).toBe(0.6);
  });
});

describe('vehicle condition', () => {
  it('reduces speed, increases fuel use and raises wear at low condition', () => {
    const worn = { health: 20 };
    expect(getVehicleConditionFactor(worn)).toBeLessThan(getVehicleConditionFactor({ health: 100 }));
    expect(getVehicleFuelConditionFactor(worn)).toBeGreaterThan(1);
    expect(getVehicleWearPerKm(worn)).toBe(0.002);

    GS.staff = [{ role: 'mechanic', skill: 5 }];
    expect(getVehicleWearPerKm(worn)).toBeLessThan(0.002);
  });
});

describe('contract performance and bidding', () => {
  it('rewards four on-time contract deliveries with a rate renewal and cash bonus', () => {
    const contract = createContractFromTemplate(CONTRACT_TEMPLATES[0], 0);
    const oldValue = contract.value;
    let bonus = 0;
    for (let i = 0; i < 4; i++) bonus = recordContractDelivery(contract, true);

    expect(contract.renewals).toBe(1);
    expect(contract.value).toBeGreaterThan(oldValue);
    expect(bonus).toBeGreaterThan(0);
    expect(getContractReliability(contract)).toBe(100);
  });

  it('turns a successful aggressive bid into an active recurring contract', () => {
    const template = CONTRACT_TEMPLATES[1];
    const tender = {
      id: 't1',
      templateId: template.id,
      title: template.title,
      clientId: template.clientId,
      competitorFactor: 1.02,
      status: 'open',
    };
    GS.tenders = [tender];

    const result = submitTenderBid('t1', 'aggressive', () => 0, 0);
    expect(result.won).toBe(true);
    expect(BID_STRATEGIES.aggressive.factor).toBeLessThan(1);
    expect(result.contract.value).toBeLessThan(template.value);
    expect(ensureContracts()).toContain(result.contract);
  });

  it('keeps a failed bid from creating a contract', () => {
    GS.tenders = [{
      id: 't1',
      templateId: 'pharma_express',
      competitorFactor: 0.92,
      status: 'open',
    }];
    const result = submitTenderBid('t1', 'premium', () => 1, 0);
    expect(result.won).toBe(false);
    expect(GS.contracts).toHaveLength(0);
  });
});
