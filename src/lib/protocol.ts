// Gut reset protocol: elimination → step-by-step reintroduction → microbiome rebuilding.
import type { AppState, GutLog, Protocol, ReintroTest } from '../types';
import { entriesFor } from './nutrition';
import { symptomScore } from './gut';
import { addDays, parseDate, today } from './util';

export interface ProtocolItem {
  key: string;
  raw: string; // label on the raw route
  cooked: string; // high-quality cooked / pasteurised alternative
  step: '2A' | '2B' | '3' | '3F';
  group?: 'veg' | 'fruit';
  re: RegExp; // matches logged food names for this item (either route)
  histamine?: boolean; // on common high-histamine / histamine-liberator lists
  rawRisk?: boolean; // raw route carries food-safety risk
  tip?: string;
}

const same = (label: string) => ({ raw: label, cooked: label });

export const ITEMS: ProtocolItem[] = [
  // 2A — in this order
  { key: 'butter', raw: 'Raw butter', cooked: 'High-quality butter (grass-fed/organic)', step: '2A', re: /butter|ghee/i, rawRisk: true },
  { key: 'cheese', raw: 'Raw cheese', cooked: 'Aged high-quality cheese (grass-fed/organic)', step: '2A', re: /cheese|\bost\b|cheddar|parmesan|gruy/i, rawRisk: true, histamine: true, tip: 'Aged cheese is high in histamine — start with a very small piece.' },
  { key: 'yolk', raw: 'Raw egg yolks', cooked: 'Soft-cooked (runny) yolks, pasture-raised eggs', step: '2A', re: /yolk/i, rawRisk: true },
  // 2B
  { key: 'tartare', raw: 'Raw meat tartare', cooked: 'Lightly seared high-quality beef', step: '2B', re: /tartare|carpaccio|seared|rare beef/i, rawRisk: true, tip: 'Use a fresh whole cut, minced the same day. Leftover/aged meat builds histamine.' },
  { key: 'carrot', ...same('Boiled carrots'), step: '2B', group: 'veg', re: /carrot|morot/i },
  { key: 'cucumber', ...same('Peeled cucumber'), step: '2B', group: 'veg', re: /cucumber|gurka/i },
  { key: 'zucchini', ...same('Peeled zucchini'), step: '2B', group: 'veg', re: /zucchini|courgette|squash, summer/i },
  { key: 'squash', ...same('Pumpkin / butternut squash (small portions)'), step: '2B', group: 'veg', re: /pumpkin|butternut|squash|pumpa/i, tip: 'Larger portions get higher in FODMAPs — keep it small at first.' },
  { key: 'parsnip', ...same('Parsnip'), step: '2B', group: 'veg', re: /parsnip|palsternack/i },
  { key: 'greenbeans', ...same('Cooked green beans'), step: '2B', group: 'veg', re: /green bean|haricot|sperisbön/i },
  { key: 'spinach', ...same('Cooked spinach'), step: '2B', group: 'veg', re: /spinach|spenat/i, histamine: true },
  { key: 'lettuce', ...same('Lettuce'), step: '2B', group: 'veg', re: /lettuce|sallad|salad greens/i },
  { key: 'blueberries', ...same('Blueberries'), step: '2B', group: 'fruit', re: /blueberr|blåbär/i },
  { key: 'strawberries', ...same('Strawberries'), step: '2B', group: 'fruit', re: /strawberr|jordgubb/i, histamine: true },
  { key: 'kiwi', ...same('Kiwi'), step: '2B', group: 'fruit', re: /kiwi/i, histamine: true },
  { key: 'orange', ...same('Orange'), step: '2B', group: 'fruit', re: /orange|apelsin|clementin|mandarin/i, histamine: true },
  { key: 'papaya', ...same('Papaya'), step: '2B', group: 'fruit', re: /papaya/i, histamine: true },
  { key: 'banana', ...same('Firm, just-ripe banana'), step: '2B', group: 'fruit', re: /banana|banan/i, tip: 'Firm, slightly green-tipped bananas are lower in FODMAPs than very ripe ones.' },
  // 3
  { key: 'milk', raw: 'Raw milk', cooked: 'Organic whole milk (gently pasteurised, non-homogenised if available)', step: '3', re: /milk|mjölk/i, rawRisk: true, tip: 'Add after the yogurt is well tolerated. Start with a small glass or less.' },
  // 3 — fermented foods last
  { key: 'kefir', ...same('Kefir'), step: '3F', re: /kefir/i, histamine: true },
  { key: 'sauerkraut', ...same('Sauerkraut'), step: '3F', re: /sauerkraut|surkål/i, histamine: true, tip: 'Start with 1–2 teaspoons.' },
  { key: 'kimchi', ...same('Kimchi'), step: '3F', re: /kimchi/i, histamine: true, tip: 'Start with 1–2 teaspoons. Usually contains garlic and onion.' },
];

export const itemLabel = (p: Protocol, it: ProtocolItem) => (p.raw ? it.raw : it.cooked);
export const itemByKey = (key: string) => ITEMS.find((i) => i.key === key);

export const PHASES = {
  1: { name: 'Phase 1 · Elimination', minDays: 35, goal: 'Calm the gut with a minimal diet.', moveOn: 'Digestion feels stable and symptoms have settled — after at least 5 weeks.' },
  2: { name: 'Phase 2 · Reintroduction', minDays: 21, goal: 'Rebuild tolerance one food at a time (suggested 3–4 weeks).', moveOn: 'You have worked through the 2A and 2B foods and know which ones suit you.' },
  3: { name: 'Phase 3 · Microbiome rebuilding', minDays: 0, goal: 'Expand into a diverse, microbiome-friendly diet. Ongoing.', moveOn: '' },
} as const;

export const RULES = [
  'Introduce one new food at a time, in a small amount, and wait 2–3 days before adding the next.',
  'Keep a simple daily log of food, stool, bloating, pain, energy, sleep and mood (the Gut check-in).',
  'If a new food causes symptoms, remove it, wait until you’re settled, and retry later in a smaller amount.',
  'Cook rice fresh and eat it right away. Don’t reheat or store it.',
  'Drink water, and salt your food to taste.',
];

export const PHASE1_EAT = [
  'Meat: beef, lamb, pork, poultry',
  'Eggs',
  'Animal fats: tallow, lard, duck fat',
  'Carbs, only two: freshly cooked white rice and peeled potatoes',
];
export const PHASE1_AVOID = 'All high-FODMAP foods, plus all other vegetables, fruit, legumes, grains, dairy, sweeteners, onion and garlic.';

const PHASE1_RE = /(beef|steak|mince|lamb|pork|chicken|turkey|duck|poultry|\begg|tallow|lard|white rice|rice, white|potato|salt)/i;
const PHASE1_NOT = /(sweet potato|tartare|potato chips|crisps|egg noodle|egg pasta)/i;

export const dayOf = (from: string, to = today()) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000) + 1;

/** Is this logged food within the current phase of the protocol? */
export function allowedNow(s: AppState, name: string): boolean {
  const p = s.protocol;
  if (!p || p.phase === 3) return true;
  if (PHASE1_RE.test(name) && !PHASE1_NOT.test(name)) return true;
  if (p.phase === 2) return p.tests.some((t) => t.result !== 'reaction' && itemByKey(t.food)?.re.test(name));
  return false;
}

/** Foods logged in the last 7 days (within this phase) that aren't on the current phase's list. */
export function offProtocol(s: AppState) {
  const p = s.protocol;
  if (!p || p.phase === 3) return [];
  const out = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = addDays(today(), -i);
    if (d < p.phaseStart) break;
    for (const e of entriesFor(s, d)) if (!allowedNow(s, e.name)) out.set(e.name, (out.get(e.name) ?? 0) + 1);
  }
  return [...out.entries()].map(([name, days]) => ({ name, days }));
}

/** Symptom score used to judge reactions: gut symptoms + skin (eczema). 0–13. */
export const reactionScore = (g: GutLog) => symptomScore(g) + (g.skin ?? 0);

const avgScore = (logs: GutLog[]) => (logs.length ? logs.reduce((a, g) => a + reactionScore(g), 0) / logs.length : undefined);

/** Compare symptoms during a test (start … +2 days) with the 3 days before it. */
export function assessTest(s: AppState, t: ReintroTest) {
  const logs = (s.gut ?? []).filter((g) => !g.wellnessOnly);
  const end = t.ended ?? addDays(t.start, 2);
  const before = logs.filter((g) => g.date >= addDays(t.start, -3) && g.date < t.start);
  const during = logs.filter((g) => g.date >= t.start && g.date <= end);
  const b = avgScore(before), d = avgScore(during);
  return { before: b, during: d, nBefore: before.length, nDuring: during.length, rose: b !== undefined && d !== undefined && d - b >= 1 };
}

export const activeTest = (p: Protocol) => p.tests.find((t) => t.result === 'testing');

/** Items for the current phase not tested yet, in the suggested order. */
export function upcoming(p: Protocol) {
  const steps = p.phase === 2 ? ['2A', '2B'] : p.phase === 3 ? ['3', '3F'] : [];
  const tested = new Set(p.tests.map((t) => t.food)); // reactions are retried from the Results list
  return ITEMS.filter((i) => steps.includes(i.step) && !tested.has(i.key));
}

export const reactions = (p: Protocol) => {
  const ok = new Set(p.tests.filter((t) => t.result !== 'reaction').map((t) => t.food));
  return p.tests.filter((t) => t.result === 'reaction' && !ok.has(t.food));
};

export const YOGURT_CAP = 16; // tablespoons ≈ 1 cup

export function yogurtToday(p: Protocol) {
  if (!p.yogurt) return undefined;
  const day = dayOf(p.yogurt.start);
  const cap = p.yogurt.cap ?? YOGURT_CAP;
  return { day, tbsp: Math.min(cap, day), cap, holding: day >= cap };
}

/** Average reaction score and skin score per protocol week. */
export function weeklyScores(s: AppState) {
  const p = s.protocol!;
  const weeks = Math.max(1, Math.ceil(dayOf(p.start) / 7));
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDays(p.start, i * 7), to = addDays(p.start, i * 7 + 6);
    const logs = (s.gut ?? []).filter((g) => !g.wellnessOnly && g.date >= from && g.date <= to);
    const skin = logs.filter((g) => g.skin !== undefined);
    return { week: i + 1, from, n: logs.length, score: avgScore(logs), skin: skin.length ? skin.reduce((a, g) => a + g.skin!, 0) / skin.length : undefined };
  });
}

/** Short text description for the AI coach. */
export function protocolContext(s: AppState): string {
  const p = s.protocol;
  if (!p) return '';
  const lines = [
    `The user is following a self-chosen GUT RESET PROTOCOL (for eczema, histamine and gut issues), ${p.raw ? 'raw-food route' : 'cooked/pasteurised high-quality route (no raw foods)'}. Started ${p.start}. Now ${PHASES[p.phase].name}, day ${dayOf(p.phaseStart)}.`,
    `Rules: one new food at a time, small amount, wait 2–3 days; remove on reaction and retry later smaller; fresh-cooked rice only (no reheating); water and salt to taste.`,
    `Phase 1 foods: beef, lamb, pork, poultry, eggs, tallow/lard/duck fat, fresh white rice, peeled potatoes. Nothing else.`,
  ];
  const ok = p.tests.filter((t) => t.result === 'ok').map((t) => itemLabel(p, itemByKey(t.food)!));
  const bad = reactions(p).map((t) => itemLabel(p, itemByKey(t.food)!));
  const cur = activeTest(p);
  if (ok.length) lines.push(`Reintroduced OK: ${ok.join(', ')}.`);
  if (bad.length) lines.push(`Reacted to (removed for now): ${bad.join(', ')}.`);
  if (cur) lines.push(`Currently testing: ${itemLabel(p, itemByKey(cur.food)!)} (day ${dayOf(cur.start)}).`);
  const y = yogurtToday(p);
  if (y) lines.push(`L. reuteri yogurt ramp: day ${y.day}, ${y.tbsp} tbsp/day (cap ${y.cap}).`);
  const nxt = upcoming(p)[0];
  if (nxt && p.phase > 1) lines.push(`Next suggested food: ${itemLabel(p, nxt)}.`);
  return lines.join('\n');
}
