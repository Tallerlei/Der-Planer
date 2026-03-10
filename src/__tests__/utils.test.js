import { describe, it, expect } from 'vitest';
import { rand, randFloat, pick, uid, fmt } from '../utils.js';

describe('rand', () => {
  it('returns integer within range', () => {
    for (let i = 0; i < 100; i++) {
      const r = rand(1, 10);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
      expect(Number.isInteger(r)).toBe(true);
    }
  });

  it('returns min when min === max', () => {
    expect(rand(5, 5)).toBe(5);
  });
});

describe('randFloat', () => {
  it('returns float within range', () => {
    for (let i = 0; i < 50; i++) {
      const r = randFloat(0, 1);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});

describe('pick', () => {
  it('returns element from array', () => {
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 20; i++) {
      expect(arr).toContain(pick(arr));
    }
  });
});

describe('uid', () => {
  it('starts with underscore', () => {
    expect(uid()).toMatch(/^_/);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, uid));
    expect(ids.size).toBe(1000);
  });
});

describe('fmt.date', () => {
  it('formats date correctly', () => {
    expect(fmt.date(1, 3, 1994)).toBe('01.03.1994');
    expect(fmt.date(15, 12, 2000)).toBe('15.12.2000');
  });
});

describe('fmt.weight', () => {
  it('formats kg for small weights', () => {
    expect(fmt.weight(500)).toBe('500 kg');
  });

  it('formats tonnes for weights >= 1000', () => {
    expect(fmt.weight(2000)).toBe('2.0 t');
    expect(fmt.weight(1500)).toBe('1.5 t');
  });
});
