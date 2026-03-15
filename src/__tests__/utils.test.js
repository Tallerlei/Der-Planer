import { describe, it, expect, vi } from 'vitest';
import { rand, randFloat, pick, uid, fmt, findById, debounce } from '../utils.js';

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

describe('fmt.time', () => {
  it('formats time with zero-padded hours and minutes', () => {
    expect(fmt.time(9, 5)).toBe('09:05');
    expect(fmt.time(14, 30)).toBe('14:30');
    expect(fmt.time(0, 0)).toBe('00:00');
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

describe('findById', () => {
  it('finds an element by id', () => {
    const items = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }];
    expect(findById(items, 'b')).toEqual({ id: 'b', v: 2 });
  });

  it('returns undefined when id is not found', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(findById(items, 'z')).toBeUndefined();
  });

  it('returns undefined for empty collection', () => {
    expect(findById([], 'a')).toBeUndefined();
  });
});

describe('debounce', () => {
  it('delays the function call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('resets the timer on repeated calls and only fires once', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('passes arguments to the wrapped function', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced('a', 42);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith('a', 42);

    vi.useRealTimers();
  });
});
