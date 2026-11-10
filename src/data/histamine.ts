// Histamine ratings for foods (by name), based on commonly used lists (e.g. SIGHI) and the
// German/Swiss/Austrian guideline. Lists disagree and freshness matters more than the food itself,
// so these are starting points for personal testing, not facts about every portion.
import type { AppState, GutLog } from '../types';
import { entriesFor } from '../lib/nutrition';
import { addDays, today } from '../lib/util';
import guide from '../../docs/health/histamine-guide.md?raw';
import guideFi from '../../docs/health/histamine-guide.fi.md?raw';
import guideSv from '../../docs/health/histamine-guide.sv.md?raw';
import { lang } from '../i18n';

export const HISTAMINE_GUIDE = guide;
/** The guide in the app's current language (the AI coach always gets the English reference text). */
export const histamineGuide = () => (lang() === 'fi' ? guideFi : lang() === 'sv' ? guideSv : guide);

export type HLevel = 'low' | 'medium' | 'high';
export interface HRating { level: HLevel; liberator?: boolean; daoBlocker?: boolean; note?: string }

const R = (re: RegExp, r: HRating) => ({ re, r });
// First match wins, so specific rules come before general ones.
const RULES: { re: RegExp; r: HRating }[] = [
  // Alcohol: histamine + blocks DAO
  R(/(wine|vin\b|champagne|prosecco)/i, { level: 'high', daoBlocker: true, note: 'Wine is among the highest-histamine drinks and alcohol blocks DAO.' }),
  R(/(beer|lager|\böl\b|cider)/i, { level: 'high', daoBlocker: true, note: 'Fermented, and alcohol blocks DAO.' }),
  R(/(spirits|vodka|whisk|gin\b|rum\b)/i, { level: 'medium', daoBlocker: true, note: 'Low in histamine itself, but alcohol blocks DAO.' }),
  R(/(energy drink)/i, { level: 'low', daoBlocker: true, note: 'Listed as a possible DAO blocker in some sources.' }),
  R(/^(tea|black tea|green tea)/i, { level: 'low', daoBlocker: true, note: 'Black/green tea may inhibit DAO in some people (weak evidence).' }),
  // Fermented
  R(/(sauerkraut|kimchi|kombucha|miso|soy sauce|tempeh|fish sauce)/i, { level: 'high', note: 'Fermented foods are high in histamine.' }),
  R(/(kefir|l\. reuteri yogurt)/i, { level: 'high', note: 'Long fermentation builds histamine; some strains produce it.' }),
  R(/(vinegar|pickle|pickled|inlagd)/i, { level: 'high', note: 'Vinegar and pickled foods are high in histamine.' }),
  // Aged cheese and cured meat
  R(/(raw cheese|hard cheese|light cheese|cheddar|parmesan|gouda|präst|herrgård|blue cheese|camembert|brie|halloumi|feta)/i, { level: 'high', note: 'Aged and ripened cheeses build histamine.' }),
  R(/(salami|chorizo|bacon|ham\b|sausage|frankfurter|korv|pepperoni|cured|jerky)/i, { level: 'high', note: 'Cured and processed meats are high in histamine.' }),
  R(/(smoked salmon|smoked|tuna, canned|sardines|mackerel in|herring|anchov|canned fish)/i, { level: 'high', note: 'Canned, smoked and pickled fish are high in histamine.' }),
  R(/(lasagne|pizza)/i, { level: 'high', note: 'Tomato plus aged cheese, and often reheated.' }),
  R(/(meatballs|leftover)/i, { level: 'medium', note: 'Ready meals and leftovers build histamine over time.' }),
  // Vegetables known to be high
  R(/(tomato|ketchup|salsa|pasta \/ tomato sauce|crushed tomatoes)/i, { level: 'high', liberator: true, note: 'Tomato is high in histamine and a possible liberator.' }),
  R(/(spinach)/i, { level: 'high', note: 'Spinach is naturally high in histamine.' }),
  R(/(aubergine|eggplant)/i, { level: 'high', note: 'Eggplant is naturally high in histamine.' }),
  R(/(avocado)/i, { level: 'high', note: 'Avocado is naturally high in histamine.' }),
  // Liberators
  R(/(chocolate|cocoa|kakao)/i, { level: 'medium', liberator: true, note: 'Chocolate contains other amines and is a possible liberator.' }),
  R(/(orange|mandarin|clementine|lemon|lime|grapefruit|citrus|juice, orange|orange juice)/i, { level: 'low', liberator: true, note: 'Citrus is a possible histamine liberator.' }),
  R(/(strawberr|kiwi|papaya|pineapple|raspberr)/i, { level: 'low', liberator: true, note: 'Listed as a possible histamine liberator.' }),
  R(/(banana)/i, { level: 'medium', liberator: true, note: 'Ripe bananas are higher; firm ones are usually better tolerated.' }),
  R(/(walnut|cashew|peanut)/i, { level: 'medium', liberator: true, note: 'Some nuts are listed as liberators.' }),
  R(/(egg white)/i, { level: 'low', liberator: true, note: 'Raw egg white is listed as a liberator; cooked eggs are usually fine.' }),
  // Medium
  R(/(mackerel|tuna steak|sardine)/i, { level: 'medium', note: 'Oily fish build histamine fast. Fine when very fresh or frozen right after catch.' }),
  R(/(shrimp|prawn|mussel|shellfish|crab|lobster)/i, { level: 'medium', note: 'Shellfish build histamine quickly unless very fresh.' }),
  R(/(skyr|filmjölk|yogh?urt|yogurt)/i, { level: 'medium', note: 'Fermented dairy; short fermentation is usually tolerated better than long.' }),
  R(/(tofu|soy drink|edamame|lentil|chickpea|kidney bean|black bean|hummus|seitan|pea protein)/i, { level: 'medium', note: 'Legumes and soy are often listed as moderate.' }),
  R(/(mushroom)/i, { level: 'medium', note: 'Mushrooms are moderate, higher when not fresh.' }),
  R(/(beef tartare|tartare|ground beef|mince|färs)/i, { level: 'medium', note: 'Minced meat builds histamine faster. Use it the same day or freeze it.' }),
  R(/(salmon|cod|trout|pollock|fish)/i, { level: 'low', note: 'Fresh or flash-frozen fish is low. Histamine rises quickly when fish isn’t fresh.' }),
  R(/(coffee|latte)/i, { level: 'low', note: 'Usually tolerated, but individual.' }),
];

const cache = new Map<string, HRating>();
/** Histamine rating for a food name (default: low, i.e. fresh whole food). */
export function histamineOf(name: string): HRating {
  const hit = cache.get(name);
  if (hit) return hit;
  const r = RULES.find((x) => x.re.test(name))?.r ?? { level: 'low' };
  cache.set(name, r);
  return r;
}

/** "Bucket" points for an amount of a food: high 3, medium 1, liberator +1, DAO blocker +2. Small amounts count less. */
export function histaminePoints(name: string, grams: number) {
  const r = histamineOf(name);
  const base = (r.level === 'high' ? 3 : r.level === 'medium' ? 1 : 0) + (r.liberator ? 1 : 0) + (r.daoBlocker ? 2 : 0);
  const amount = grams >= 100 ? 1 : grams >= 30 ? 0.7 : 0.4;
  return base * amount;
}

export const avoidInElimination = (name: string) => { const r = histamineOf(name); return r.level === 'high' || !!r.liberator || !!r.daoBlocker; };

export const HIST_SYMPTOMS = [
  { key: 'flush', label: 'Flushing' }, { key: 'itch', label: 'Itching / hives' }, { key: 'headache', label: 'Headache' },
  { key: 'nose', label: 'Blocked / runny nose' }, { key: 'heart', label: 'Palpitations' }, { key: 'dizzy', label: 'Dizziness' },
];
export const histSymptomScore = (g: GutLog) => Math.min(3, (g.hist ?? []).length);

/** Daily histamine load vs symptoms, for the bucket chart and personal threshold. */
export function histamineBucket(s: AppState, days = 21) {
  const rows = Array.from({ length: days }, (_, i) => {
    const d = addDays(today(), -days + 1 + i);
    const es = entriesFor(s, d);
    const load = es.reduce((a, e) => a + histaminePoints(e.name, e.grams), 0);
    const g = (s.gut ?? []).find((x) => x.date === d && !x.wellnessOnly);
    const sym = g ? (g.skin ?? 0) + histSymptomScore(g) + Math.max(g.bloating, g.pain) : undefined;
    const top = [...es].map((e) => ({ name: e.name, p: histaminePoints(e.name, e.grams) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p).slice(0, 3).map((x) => x.name);
    return { date: d, load: Math.round(load * 10) / 10, logged: es.length > 0, symptoms: sym, top };
  });
  // Personal threshold: the load above which symptom days clearly outnumber calm days (needs data).
  const both = rows.filter((r) => r.logged && r.symptoms !== undefined);
  let threshold: number | undefined;
  if (both.length >= 10) {
    const cands = [...new Set(both.map((r) => Math.round(r.load)))].sort((a, b) => a - b);
    let best = -1;
    for (const c of cands) {
      const hi = both.filter((r) => r.load > c), lo = both.filter((r) => r.load <= c);
      if (hi.length < 3 || lo.length < 3) continue;
      const diff = hi.reduce((a, r) => a + r.symptoms!, 0) / hi.length - lo.reduce((a, r) => a + r.symptoms!, 0) / lo.length;
      if (diff > best && diff >= 1) { best = diff; threshold = c; }
    }
  }
  return { rows, threshold, checkins: both.length };
}
