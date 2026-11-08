export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => toDateKey(new Date());
export const parseDate = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (key: string, n: number) => { const d = parseDate(key); d.setDate(d.getDate() + n); return toDateKey(d); };
export const prettyDate = (key: string) => {
  if (key === today()) return 'Today';
  if (key === addDays(today(), -1)) return 'Yesterday';
  return parseDate(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
export const shortDate = (key: string) => parseDate(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
/** Monday of the week containing `key`. */
export const weekStart = (key: string) => { const d = parseDate(key); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toDateKey(d); };

export const round = (n: number, dp = 0) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };
export const fmt = (n: number | undefined, dp = 0) => (n === undefined || isNaN(n) ? '–' : round(n, dp).toLocaleString());
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const fmtDuration = (min: number) => { const h = Math.floor(min / 60); const m = Math.round(min % 60); return h ? `${h}h ${m}m` : `${m}m`; };
export const fmtPace = (minPerKm: number) => { const m = Math.floor(minPerKm); const s = Math.round((minPerKm - m) * 60); return `${m}:${String(s).padStart(2, '0')}/km`; };
