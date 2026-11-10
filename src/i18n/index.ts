// Lightweight translations: the English text is the key (gettext-style), so untranslated text simply
// falls back to English. Variables use {name}: t('Day {n} of {total}', { n: 3, total: 35 }).
import fi from './fi.json';
import sv from './sv.json';

export type Lang = 'en' | 'fi' | 'sv';
export type LangSetting = Lang | 'auto';
export const LANGS: { key: Lang; label: string }[] = [{ key: 'en', label: 'English' }, { key: 'fi', label: 'Suomi' }, { key: 'sv', label: 'Svenska' }];

const DICTS: Record<Exclude<Lang, 'en'>, Record<string, string>> = { fi, sv };
let current: Lang = 'en';

export function detectLang(): Lang {
  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language]) ?? [];
  for (const l of langs) { const c = l.toLowerCase().slice(0, 2); if (c === 'fi' || c === 'sv' || c === 'en') return c as Lang; }
  return 'en';
}
export function setLang(setting: LangSetting | undefined) {
  current = !setting || setting === 'auto' ? detectLang() : setting;
  document.documentElement.lang = current;
}
export const lang = () => current;
/** BCP-47 locale for dates and numbers. */
export const locale = () => (current === 'fi' ? 'fi-FI' : current === 'sv' ? 'sv-FI' : 'en-GB');

// ---- Template matching: generated sentences such as "Add 2.5 kg → 82.5 kg × 6" are matched against
// dictionary keys that contain {placeholders}; captured parts are translated recursively. ----
interface Tpl { re: RegExp; greedy: RegExp; names: string[]; out: string; lits: string[]; weight: number }
const TPLS: Partial<Record<Lang, Tpl[]>> = {};
const CACHE: Partial<Record<Lang, Map<string, string>>> = {};
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function templates(l: Exclude<Lang, 'en'>): Tpl[] {
  if (TPLS[l]) return TPLS[l]!;
  const list: Tpl[] = [];
  for (const [k, out] of Object.entries(DICTS[l])) {
    if (!/\{[\w]+\}/.test(k)) continue;
    const parts = k.split(/\{(\w+)\}/); // literal, name, literal, name, ...
    const lits = parts.filter((_, i) => i % 2 === 0);
    const weight = lits.join('').replace(/\s/g, '').length;
    if (weight < 3) continue; // "{v0}{v1}" style keys would match anything
    const names = parts.filter((_, i) => i % 2 === 1);
    const build = (q: string) => new RegExp('^' + parts.map((x, i) => (i % 2 ? `([\\s\\S]*${q})` : esc(x))).join('') + '$');
    list.push({ re: build('?'), greedy: build(''), names, out, lits: lits.filter(Boolean), weight });
  }
  list.sort((a, b) => b.weight - a.weight); // most specific first
  return (TPLS[l] = list);
}
const LOW: Partial<Record<Lang, Map<string, string>>> = {};
const short = (x: string) => x.split(',')[0].replace(/\s*\(.*\)$/, '').trim();
function lowerIndex(l: Exclude<Lang, 'en'>) {
  if (LOW[l]) return LOW[l]!;
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(DICTS[l])) {
    if (k.length > 60 || k.includes('{')) continue;
    const lv = (x: string) => (/^[A-ZÅÄÖ][a-zåäö]/.test(x) ? x[0].toLowerCase() + x.slice(1) : x);
    if (!m.has(k.toLowerCase())) m.set(k.toLowerCase(), lv(v));
    const sk = short(k).toLowerCase();
    if (!m.has(sk)) m.set(sk, lv(short(v)));
  }
  return (LOW[l] = m);
}
function lookup(text: string, depth = 0): string {
  if (current === 'en' || !text) return text;
  if (depth > 0 && /^[-−+]?\d+\.\d+$/.test(text)) return text.replace('.', ','); // decimal comma in fi/sv
  const d = DICTS[current];
  const exact = d[text];
  if (exact !== undefined) return exact;
  const cache = (CACHE[current] ??= new Map());
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let res = text;
  // Keep surrounding whitespace / trailing punctuation out of the way: "Text." vs key "Text".
  const m = /^(\s*)([\s\S]*?)([\s.:!?…*]*)$/.exec(text)!;
  if (m[2] !== text && d[m[2]] !== undefined) res = m[1] + d[m[2]] + m[3];
  else if (depth > 0 && lowerIndex(current).has(text.toLowerCase())) {
    const low = lowerIndex(current).get(text.toLowerCase())!;
    res = /^[A-ZÅÄÖ]/.test(text) ? low[0].toUpperCase() + low.slice(1) : low;
  } else {
    if (depth < 4 && /[A-Za-z]{2}/.test(text)) {
      // Captured parts should be numbers or translatable text; try lazy, then greedy splitting.
      const resolved = (c: string) => !/[A-Za-z]{2}/.test(c) || lookup(c, depth + 1) !== c;
      for (const tp of templates(current)) {
        if (!tp.lits.every((x) => text.includes(x))) continue;
        let mm = tp.re.exec(text);
        if (!mm) continue;
        if (!mm.slice(1).every(resolved)) { const g = tp.greedy.exec(text); if (g && g.slice(1).filter(resolved).length > mm.slice(1).filter(resolved).length) mm = g; }
        // A placeholder swallowing a long untranslated sentence means free text, not a template.
        if (mm.slice(1).some((c) => c.split(/\s+/).length > 8 && !resolved(c))) continue;
        const caps = mm.slice(1);
        let out = tp.out;
        tp.names.forEach((n, i) => { out = out.split(`{${n}}`).join(lookup(caps[i], depth + 1)); });
        res = out;
        break;
      }
    }
    if (res === text && depth < 4) {
      // Lists built by the app: "A · B · C", "A + B", and (inside sentences) "a and b".
      const sep = text.includes(' · ') ? ' · ' : text.includes(' + ') ? ' + ' : depth > 0 && text.split(' and ').length > 1 && text.split(' and ').length <= 4 ? ' and ' : '';
      if (sep) res = text.split(sep).map((x) => lookup(x, depth + 1)).join(sep === ' and ' ? (current === 'fi' ? ' ja ' : ' och ') : sep);
    }
  }
  // Names inside sentences arrive lowercased and shortened ("chicken breast" for "Chicken breast, cooked").
  if (res === text && depth > 0) {
    const low = lowerIndex(current).get(text.toLowerCase());
    if (low) res = /^[A-ZÅÄÖ]/.test(text) ? low[0].toUpperCase() + low.slice(1) : low;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(text, res);
  return res;
}

export function t(text: string, vars?: Record<string, string | number>): string {
  if (typeof text !== 'string') return text;
  let s = vars ? (current === 'en' ? text : DICTS[current][text] ?? text) : lookup(text);
  if (vars) {
    if (s === text && current !== 'en') { // no exact key: fill in, then try the template matcher
      for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return lookup(s);
    }
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(typeof v === 'string' ? lookup(v, 1) : String(v));
  }
  return s;
}
export const tr = t;
/** Translate a value that may be missing or not a string (render helpers). */
export const trs = <T,>(x: T): T => (typeof x === 'string' ? (lookup(x) as unknown as T) : x);
/** Has the active language a translation for this exact text? */
export const hasTr = (text: string) => current !== 'en' && DICTS[current][text] !== undefined;
