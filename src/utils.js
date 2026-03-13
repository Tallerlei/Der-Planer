export const $ = id => document.getElementById(id);

export const fmt = {
  money:    n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n),
  moneyDec: n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n),
  num:      n => new Intl.NumberFormat('de-DE').format(Math.round(n)),
  date:     (d, m, y) => `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`,
  time:     (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  pct:      n => `${Math.round(n)} %`,
  km:       n => `${fmt.num(n)} km`,
  weight:   n => n >= 1000 ? `${(n/1000).toFixed(1)} t` : `${n} kg`,
};

export function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function randFloat(min, max) { return Math.random() * (max - min) + min; }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function uid() { return '_' + Math.random().toString(36).slice(2, 9); }

/** Returns the first element of `collection` whose `.id` matches `id`, or undefined. */
export function findById(collection, id) { return collection.find(x => x.id === id); }
