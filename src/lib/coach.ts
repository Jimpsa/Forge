// Rule-based diet coach: turns logged food, weigh-ins and training into ranked, quantified suggestions.
import type { AppState, Food, FoodEntry, NutrientKey, Nutrients } from '../types';
import { BUILTIN_FOODS } from '../data/foods';
import { dailyTargets, entriesFor, findFood, isTrainingDay, microTargets, scale, sum, tdee } from './nutrition';
import { sessionKind } from './training';
import { addDays, parseDate, today } from './util';
import { allowedNow } from './protocol';

// ---------------- Food categories ----------------

export type Category =
  | 'alcohol' | 'sweet-drink' | 'treat' | 'oil' | 'nuts' | 'cereal' | 'cheese' | 'fatty-meat' | 'lean-protein'
  | 'protein' | 'dairy' | 'starch' | 'legume' | 'fruit' | 'veg' | 'other';

const BUILTIN_CAT: Record<string, Category> = {
  'Chicken breast, cooked': 'lean-protein', 'Chicken thigh, cooked, skinless': 'protein', 'Ground beef 10% fat, cooked': 'fatty-meat',
  'Pork tenderloin, cooked': 'lean-protein', 'Salmon, cooked': 'protein', 'Cod, cooked': 'lean-protein', 'Tuna, canned in water': 'lean-protein',
  'Shrimp, cooked': 'lean-protein', 'Egg, whole': 'protein', 'Egg whites': 'lean-protein', 'Tofu, firm': 'protein',
  'Whey protein powder': 'lean-protein', 'Protein bar (typical)': 'treat',
  'Greek yogurt, plain, 0%': 'dairy', 'Skyr, plain': 'dairy', 'Quark / kvarg, low fat': 'dairy', 'Cottage cheese 2%': 'dairy',
  'Milk, 1.5% fat': 'dairy', 'Cheddar cheese': 'cheese', 'Granola': 'cereal',
  'Lentils, cooked': 'legume', 'Chickpeas, cooked': 'legume', 'Black beans, cooked': 'legume', 'Hummus': 'legume',
  'Avocado': 'nuts', 'Almonds': 'nuts', 'Walnuts': 'nuts', 'Peanut butter': 'nuts', 'Olive oil': 'oil', 'Butter': 'oil',
  'Dark chocolate 70%': 'treat', 'Honey': 'treat', 'Orange juice': 'sweet-drink', 'Coffee, black': 'other', 'Beer, lager': 'alcohol',
};
for (const n of ['Oats, rolled (dry)', 'White rice, cooked', 'Brown rice, cooked', 'Pasta, cooked', 'Quinoa, cooked', 'Potato, boiled',
  'Sweet potato, baked', 'Whole wheat bread', 'White bread', 'Rice cakes']) BUILTIN_CAT[n] = 'starch';
for (const n of ['Banana', 'Apple', 'Orange', 'Blueberries', 'Strawberries', 'Kiwi', 'Papaya']) BUILTIN_CAT[n] = 'fruit';
for (const n of ['Carrot, boiled', 'Zucchini, peeled, cooked', 'Butternut squash, baked', 'Pumpkin, cooked', 'Parsnip, boiled', 'Green beans, cooked', 'Spinach, cooked', 'Lettuce', 'Sauerkraut', 'Kimchi']) BUILTIN_CAT[n] = 'veg';
Object.assign(BUILTIN_CAT, {
  'Beef steak, cooked': 'protein', 'Beef tartare (raw)': 'protein', 'Lamb, cooked': 'fatty-meat', 'Turkey breast, cooked': 'lean-protein',
  'Beef tallow': 'oil', 'Lard': 'oil', 'Duck fat': 'oil', 'Raw butter': 'oil', 'Egg yolk, raw': 'protein', 'Raw cheese (hard)': 'cheese',
  'Raw milk, whole': 'dairy', 'Whole milk, organic': 'dairy', 'Egg yolk, soft-cooked': 'protein', 'L. reuteri yogurt (homemade)': 'dairy', 'Kefir': 'dairy',
} as Record<string, Category>);
for (const n of ['Broccoli', 'Spinach, raw', 'Carrot', 'Tomato', 'Red bell pepper', 'Cucumber', 'Mixed salad greens']) BUILTIN_CAT[n] = 'veg';

export function categorize(name: string, per100: Nutrients, builtin = false): Category {
  if (builtin && BUILTIN_CAT[name]) return BUILTIN_CAT[name];
  const n = name.toLowerCase();
  if (/\b(beer|öl|wine|vin|cider|vodka|whisk|gin|rum|lager|ale|ipa|prosecco|champagne|cocktail)\b/.test(n)) return 'alcohol';
  if (/(juice|soda|cola|lemonade|saft|läsk|energy drink|smoothie|iced tea|milkshake)/.test(n)) return 'sweet-drink';
  if (/(chocolate|choklad|candy|godis|cookie|kaka|cake|bulle|\bbun\b|chips|crisps|ice cream|glass|donut|munk|pastry|biscuit|kex|sweets|wafer|cereal bar|protein bar|bar\b)/.test(n)) return 'treat';
  if (/(granola|müsli|muesli|cereal|flakes|flingor)/.test(n)) return 'cereal';
  if (/(cheese|\bost\b|parmesan|mozzarella|brie|feta)/.test(n)) return 'cheese';
  const kcal = per100.kcal ?? 0;
  if (kcal <= 0) return 'other';
  const pShare = ((per100.protein ?? 0) * 4) / kcal, fShare = ((per100.fat ?? 0) * 9) / kcal, cShare = ((per100.carbs ?? 0) * 4) / kcal;
  if (kcal > 650 && fShare > 0.85) return 'oil';
  if (kcal > 450 && fShare > 0.55) return 'nuts';
  if (pShare >= 0.45 && fShare < 0.35) return 'lean-protein';
  if (pShare >= 0.25 && fShare >= 0.5 && kcal > 200) return 'fatty-meat';
  if (pShare >= 0.25) return 'protein';
  if (kcal < 60) return 'veg';
  if (cShare > 0.65 && (per100.sugar ?? 0) > 0.5 * (per100.carbs ?? 0) && kcal > 300) return 'treat';
  if (cShare > 0.65) return 'starch';
  return 'other';
}

export const foodCategory = (s: AppState, e: Pick<FoodEntry, 'foodId' | 'name' | 'nutrients' | 'grams'>): Category => {
  const f = findFood(s, e.foodId);
  if (f) return categorize(f.name, f.per100, f.source === 'builtin' || BUILTIN_FOODS.some((b) => b.id === f.id));
  return categorize(e.name, e.grams ? scale(e.nutrients, 10000 / e.grams) : e.nutrients);
};

// ---------------- Analysis ----------------

export interface Suggestion { title: string; detail: string; kcal: number }
export interface Tip { title: string; detail: string }
export interface FoodStat { foodId: string; name: string; category: Category; kcalPerDay: number; share: number; gramsPerDay: number; proteinPer100kcal: number; days: number; typicalGrams: number }

export interface Analysis {
  windowDays: number;
  loggedDays: number;
  weighIns: number;
  enough: boolean;
  goal: AppState['profile']['goal'];
  goalRate: number; // kg/week, signed
  avgKcal: number; avgTarget: number; avgProtein: number; proteinTarget: number;
  avg: Nutrients;
  trend?: { kgPerWeek: number; spanDays: number; points: number };
  formulaMaintenance: number;
  measuredMaintenance?: number; // as measured (includes training days)
  suggestedBase?: number; // value to store as maintenanceKcal (training-day bonus removed)
  gap: number; // kcal/day. >0 = eating more than the goal needs, <0 = less
  gapSource: 'trend' | 'target';
  verdict: { tone: 'good' | 'warn' | 'info'; title: string; text: string };
  eatLess: Suggestion[];
  eatMore: Suggestion[];
  moveMore: Tip[];
  protein: { tone: 'good' | 'warn'; text: string; options: Suggestion[] };
  quality: Tip[];
  training: Tip[];
  topFoods: FoodStat[];
  plantsThisWeek: number;
}

const KCAL_PER_KG = 7700;
const PER_WEEK_TO_DAY = KCAL_PER_KG / 7; // 1 kg/week ≈ 1100 kcal/day

function linreg(points: { x: number; y: number }[]) {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n, my = points.reduce((a, p) => a + p.y, 0) / n;
  const num = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0), den = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  return den ? num / den : 0;
}

const dayNum = (key: string) => Math.round(parseDate(key).getTime() / 86400000);

export function weightTrend(s: AppState, days = 28) {
  const from = addDays(today(), -days);
  const pts = s.body.filter((b) => b.weightKg && b.date > from).map((b) => ({ x: dayNum(b.date), y: b.weightKg! }));
  if (pts.length < 3) return undefined;
  const span = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  if (span < 10) return undefined;
  return { kgPerWeek: linreg(pts) * 7, spanDays: span, points: pts.length };
}

const bf = (name: string) => BUILTIN_FOODS.find((f) => f.name === name)!;
const serving = (f: Food) => f.servings[0] ?? { label: '100 g', grams: 100 };
const kcalOf = (f: Food, g: number) => ((f.per100.kcal ?? 0) * g) / 100;
const r10 = (n: number) => Math.round(n / 10) * 10;
/** 'Pasta, cooked' -> 'pasta' for use inside sentences. */
export const clean = (name: string) => name.split(',')[0].replace(/\s*\(.*\)$/, '').trim().toLowerCase();

const CUT_SWAPS: Partial<Record<Category, { save: number; tip: (n: string) => string }>> = {
  alcohol: { save: 0.5, tip: (n) => `Halve your ${n}. Alcohol is 7 kcal/g, gives no protein and slows recovery. Alcohol-free beer is ~20 kcal per 33 cl.` },
  'sweet-drink': { save: 0.8, tip: (n) => `Swap ${n} for water, a zero-sugar version or a whole fruit — liquid sugar barely fills you up.` },
  treat: { save: 0.5, tip: (n) => `Keep the ${n}, but halve the portion — or swap it for skyr/Greek yogurt with berries.` },
  oil: { save: 0.5, tip: (n) => `Measure ${n} with a spoon or use spray oil. Free-poured fat easily adds 100–200 kcal unnoticed.` },
  nuts: { save: 0.4, tip: (n) => `${n[0].toUpperCase() + n.slice(1)} is healthy but very calorie-dense — weigh out 20–30 g instead of eating from the jar or bag.` },
  cereal: { save: 0.35, tip: (n) => `Swap ${n} for oats with fruit, or halve it and top up with skyr.` },
  cheese: { save: 0.35, tip: (n) => `Use a lighter ${n} (around 17% fat) or thinner slices.` },
  'fatty-meat': { save: 0.3, tip: (n) => `Choose a leaner version of ${n} (5% mince, chicken breast, pork tenderloin) — same protein, fewer calories.` },
  starch: { save: 0.25, tip: (n) => `Replace a third of your ${n} with vegetables — same plate size, fewer calories, more fiber.` },
  other: { save: 0.25, tip: (n) => `Cut your usual ${n} portion by about a quarter.` },
  protein: { save: 0.15, tip: (n) => `Trim the ${n} portion slightly or pick a leaner protein for some meals.` },
};

const BULK_ADDS: { name: string; grams?: number; label?: string; note: string }[] = [
  { name: 'Olive oil', note: 'Stir into rice, pasta or salad — the easiest calories with no extra volume.' },
  { name: 'Peanut butter', grams: 32, label: '2 tbsp', note: 'On bread, rice cakes or oats.' },
  { name: 'Almonds', grams: 30, label: '1 handful', note: 'A snack between meals.' },
  { name: 'Milk, 1.5% fat', note: 'Drink a glass with meals — liquid calories are easy when appetite is low.' },
  { name: 'Oats, rolled (dry)', grams: 60, label: '60 g', note: 'A bigger breakfast bowl, or a pre-bed bowl with milk.' },
  { name: 'Granola', note: 'On top of skyr or yogurt.' },
  { name: 'Banana', note: 'Before or after training.' },
  { name: 'Beef tallow', note: 'Cook meat and potatoes in it — dense calories that fit the gut reset.' },
  { name: 'Egg, whole', grams: 100, label: '2 eggs', note: 'Add to any meal.' },
  { name: 'White rice, cooked', note: 'Cook fresh and eat right away.' },
];

const LEAN_PROTEIN = ['Quark / kvarg, low fat', 'Skyr, plain', 'Chicken breast, cooked', 'Tuna, canned in water', 'Egg whites', 'Whey protein powder', 'Cod, cooked', 'Cottage cheese 2%', 'Shrimp, cooked'];
const ANY_PROTEIN = ['Whey protein powder', 'Chicken breast, cooked', 'Egg, whole', 'Salmon, cooked', 'Ground beef 10% fat, cooked', 'Quark / kvarg, low fat', 'Cottage cheese 2%'];

const MICRO_FOODS: Partial<Record<NutrientKey, string>> = {
  iron: 'lentils, beans, red meat, spinach, oats — eat them with vitamin C (pepper, citrus) for better absorption',
  calcium: 'milk, skyr/yogurt, cheese, tofu',
  vitD: 'fatty fish (salmon), eggs and fortified dairy — in northern winters many people need a supplement (ask your doctor)',
  potassium: 'potatoes, beans, bananas, spinach, yogurt',
  magnesium: 'nuts, oats, beans, whole grains, dark chocolate',
  zinc: 'meat, shellfish, legumes, oats, seeds',
  vitC: 'peppers, citrus, berries, broccoli',
  vitA: 'carrots, sweet potato, spinach, eggs',
  vitB12: 'meat, fish, eggs, dairy — vegans need a supplement',
};

const runningNow = (s: AppState) => s.sessions.some((x) => x.date > addDays(today(), -28) && x.cardio.some((c) => c.activity === 'run'));

export function analyze(s: AppState, windowDays = 14): Analysis {
  const p = s.profile;
  const t = today();
  const days = Array.from({ length: windowDays }, (_, i) => addDays(t, -windowDays + i)); // ends yesterday (today is incomplete)
  const dayInfo = days.map((d) => {
    const es = entriesFor(s, d);
    const n = sum(es.map((e) => e.nutrients));
    const target = dailyTargets(p, isTrainingDay(s, d));
    return { d, es, n, target, logged: (n.kcal ?? 0) >= target.kcal * 0.5 };
  });
  const logged = dayInfo.filter((x) => x.logged);
  const L = Math.max(1, logged.length);
  const avg = sum(logged.map((x) => x.n));
  for (const k of Object.keys(avg) as NutrientKey[]) avg[k] = avg[k]! / L;
  const avgKcal = avg.kcal ?? 0;
  const avgTarget = logged.reduce((a, x) => a + x.target.kcal, 0) / L;
  const proteinTarget = dailyTargets(p, false).protein;
  const goalRate = p.goal === 'cut' ? -p.rateKgPerWeek : p.goal === 'bulk' ? p.rateKgPerWeek : 0;

  // Weight trend & measured maintenance (needs a longer window).
  const trend = weightTrend(s, 28);
  let measuredMaintenance: number | undefined, suggestedBase: number | undefined;
  if (trend && trend.spanDays >= 14 && trend.points >= 4) {
    const d28 = Array.from({ length: 28 }, (_, i) => addDays(t, -28 + i));
    const l28 = d28.map((d) => ({ d, kcal: sum(entriesFor(s, d).map((e) => e.nutrients)).kcal ?? 0, tr: isTrainingDay(s, d) }))
      .filter((x) => x.kcal >= dailyTargets(p, x.tr).kcal * 0.5);
    if (l28.length >= 7) {
      const intake = l28.reduce((a, x) => a + x.kcal, 0) / l28.length;
      const m = intake - (trend.kgPerWeek * KCAL_PER_KG) / 7;
      if (m > 1200 && m < 6000) {
        measuredMaintenance = Math.round(m);
        const trainFrac = l28.filter((x) => x.tr).length / l28.length;
        suggestedBase = r10(m - p.trainingDayKcal * trainFrac);
      }
    }
  }

  // How far off the goal are we, in kcal/day? Prefer the scale (independent of logging accuracy).
  let gap: number, gapSource: Analysis['gapSource'];
  if (trend && trend.points >= 3) { gap = (trend.kgPerWeek - goalRate) * PER_WEEK_TO_DAY; gapSource = 'trend'; }
  else { gap = avgKcal - avgTarget; gapSource = 'target'; }
  gap = Math.round(gap);

  // Per-food aggregation.
  const byFood = new Map<string, FoodStat & { grams: number[] }>();
  for (const x of logged) for (const e of x.es) {
    const key = e.foodId;
    const cur = byFood.get(key) ?? { foodId: key, name: e.name, category: foodCategory(s, e), kcalPerDay: 0, share: 0, gramsPerDay: 0, proteinPer100kcal: 0, days: 0, typicalGrams: 0, grams: [] };
    cur.kcalPerDay += (e.nutrients.kcal ?? 0) / L;
    cur.gramsPerDay += e.grams / L;
    cur.proteinPer100kcal += e.nutrients.protein ?? 0; // summed; normalised below
    cur.grams.push(e.grams);
    byFood.set(key, cur);
  }
  for (const f of byFood.values()) {
    const totalKcal = f.kcalPerDay * L;
    f.proteinPer100kcal = totalKcal ? (f.proteinPer100kcal / totalKcal) * 100 : 0;
    f.share = avgKcal ? f.kcalPerDay / avgKcal : 0;
    f.days = new Set(logged.filter((x) => x.es.some((e) => e.foodId === f.foodId)).map((x) => x.d)).size;
    f.typicalGrams = f.grams.sort((a, b) => a - b)[Math.floor(f.grams.length / 2)];
  }
  const topFoods = [...byFood.values()].sort((a, b) => b.kcalPerDay - a.kcalPerDay).map(({ grams: _g, ...rest }) => rest);

  const onProtocol = !!s.protocol && s.protocol.phase < 3;
  const ok = (name: string) => !onProtocol || allowedNow(s, name);

  // ---- Eat less (goal needs fewer calories) ----
  const eatLess: Suggestion[] = [];
  if (gap > 75) {
    const cands = topFoods
      .filter((f) => f.kcalPerDay >= 40 && CUT_SWAPS[f.category])
      .map((f) => ({ f, save: f.kcalPerDay * CUT_SWAPS[f.category]!.save }))
      .sort((a, b) => b.save - a.save);
    let covered = 0;
    for (const { f, save } of cands) {
      if (eatLess.length >= 5 || (covered >= gap && eatLess.length >= 2)) break;
      const tip = onProtocol && f.category === 'starch' ? `Make the ${clean(f.name)} portion about a third smaller and add a little more meat or eggs instead.` : onProtocol && f.category === 'oil' ? `Measure the ${clean(f.name)} with a spoon — cooking fat adds up fast.` : CUT_SWAPS[f.category]!.tip(clean(f.name));
      eatLess.push({ title: f.name, detail: tip, kcal: -r10(save) });
      covered += save;
    }
  }

  // ---- Eat more (goal needs more calories) ----
  const eatMore: Suggestion[] = [];
  if (gap < -75) {
    const need = -gap;
    let covered = 0;
    const already = topFoods.filter((f) => ['starch', 'nuts', 'oil', 'dairy', 'cereal', 'legume', 'protein', 'lean-protein', 'fruit'].includes(f.category) && f.days >= 2).slice(0, 2);
    for (const f of already) {
      const add = Math.max(20, Math.round(f.typicalGrams * 0.5));
      const food = findFood(s, f.foodId);
      const k = food ? kcalOf(food, add) : (f.kcalPerDay / Math.max(1, f.gramsPerDay)) * add;
      eatMore.push({ title: `More ${clean(f.name)}`, detail: `You already eat it — add about ${add} g to your usual portion.`, kcal: r10(k) });
      covered += k;
    }
    for (const a of BULK_ADDS) {
      if (covered >= need || eatMore.length >= 4) break;
      const food = bf(a.name);
      if (!ok(food.name)) continue;
      if (eatMore.some((x) => x.title.toLowerCase().includes(clean(food.name)))) continue;
      const sv = a.grams ? { label: a.label!, grams: a.grams } : serving(food);
      const k = kcalOf(food, sv.grams);
      eatMore.push({ title: `${food.name.split(',')[0]} (${sv.label})`, detail: a.note, kcal: r10(k) });
      covered += k;
    }
  }

  // ---- Move more instead (cut) / cardio balance (bulk) ----
  const moveMore: Tip[] = [];
  const kg = p.weightKg;
  const weeks4 = s.sessions.filter((x) => x.date > addDays(t, -28));
  const runKmWeek = weeks4.reduce((a, x) => a + x.cardio.filter((c) => c.activity === 'run').reduce((b, c) => b + (c.distanceKm ?? 0), 0), 0) / 4;
  const cardioMinWeek = weeks4.reduce((a, x) => a + x.cardio.reduce((b, c) => b + c.durationMin, 0), 0) / 4;
  if (gap > 75) {
    const walkPerMin = (2.5 * kg) / 60; // brisk walk, net of resting burn
    const need = Math.ceil(gap / walkPerMin / 5) * 5;
    const mins = Math.min(need, 60);
    const burn = r10(mins * walkPerMin);
    moveMore.push({ title: `Walk ${mins} min more per day (≈ −${burn} kcal)`, detail: need <= 60
      ? `A brisk walk burns ≈${(Math.round(walkPerMin * 10) / 10).toString()} kcal/min for you (≈${Math.round(mins * 110 / 100) * 100} extra steps) — enough to cover the whole gap without eating less.`
      : `That covers about ${Math.round((burn / gap) * 100)}% of the ${gap} kcal/day gap (≈${Math.round(mins * 110 / 100) * 100} extra steps). Combine it with one or two of the food changes above.` });
    const km = Math.min(20, Math.round((gap * 7) / (kg * 0.9) / 2) * 2);
    if (runningNow(s)) moveMore.push({ title: `Or add ~${km} km of easy running per week (≈ −${r10((km * kg * 0.9) / 7)} kcal/day)`, detail: `Running burns ≈${Math.round(kg * 0.9)} kcal per km above resting for you.` });
    moveMore.push({ title: 'Or meet in the middle', detail: `Eat ~${r10(gap / 2)} kcal less AND walk ~${Math.min(60, Math.ceil(need / 2 / 5) * 5)} min more per day. Most people find a mix easier to stick with than either alone.` });
  } else if (gap < -75 && (runKmWeek > 15 || cardioMinWeek > 150)) {
    moveMore.push({ title: 'Your cardio may be eating your gains', detail: `You average ${Math.round(cardioMinWeek)} min of cardio per week. Eat back cardio calories on those days, or swap one session for lifting.` });
  }

  // ---- Protein ----
  const proteinGap = proteinTarget - (avg.protein ?? 0);
  const pool = (p.goal === 'cut' ? LEAN_PROTEIN : ANY_PROTEIN).map(bf);
  const eaten = topFoods.filter((f) => f.proteinPer100kcal >= (p.goal === 'cut' ? 15 : 8)).map((f) => findFood(s, f.foodId)).filter(Boolean) as Food[];
  const options: Suggestion[] = [];
  if (proteinGap > proteinTarget * 0.1) {
    for (const f of [...eaten, ...pool, ...(onProtocol ? ['Beef steak, cooked', 'Egg, whole', 'Turkey breast, cooked', 'Pork tenderloin, cooked'].map(bf) : [])]) {
      if (!ok(f.name)) continue;
      if (options.length >= 3 || options.some((o) => o.title.startsWith(f.name.split(',')[0]))) continue;
      const sv = serving(f);
      const pr = ((f.per100.protein ?? 0) * sv.grams) / 100;
      if (pr < 8) continue;
      options.push({ title: `${f.name.split(',')[0]} (${sv.label})`, detail: `+${Math.round(pr)} g protein`, kcal: r10(kcalOf(f, sv.grams)) });
    }
  }
  const protein: Analysis['protein'] = proteinGap > proteinTarget * 0.1
    ? { tone: 'warn', text: `You average ${Math.round(avg.protein ?? 0)} g protein vs ${proteinTarget} g target (−${Math.round(proteinGap)} g/day). ${p.goal === 'cut' ? 'Protein keeps you full and protects muscle in a deficit.' : 'Protein is the building material for new muscle.'} Spread it over 3–5 meals of ~25–40 g.`, options }
    : { tone: 'good', text: `Protein is on point: ${Math.round(avg.protein ?? 0)} g/day vs ${proteinTarget} g target.`, options };

  // ---- Food quality ----
  const quality: Tip[] = [];
  const micro = microTargets(p, avgTarget);
  const coverage = (k: NutrientKey) => {
    const tot = logged.reduce((a, x) => a + x.es.reduce((b, e) => b + (e.nutrients.kcal ?? 0), 0), 0);
    const cov = logged.reduce((a, x) => a + x.es.filter((e) => e.nutrients[k] !== undefined).reduce((b, e) => b + (e.nutrients.kcal ?? 0), 0), 0);
    return tot ? cov / tot : 0;
  };
  const topBy = (k: NutrientKey) => {
    const m = new Map<string, number>();
    for (const x of logged) for (const e of x.es) m.set(e.name, (m.get(e.name) ?? 0) + (e.nutrients[k] ?? 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n.toLowerCase()).join(' and ');
  };
  if (!onProtocol && micro.fiber && (avg.fiber ?? 0) < micro.fiber.value * 0.75 && coverage('fiber') > 0.7)
    quality.push({ title: `Low fiber: ${Math.round(avg.fiber ?? 0)} g of ${micro.fiber.value} g`, detail: 'Add a portion of beans/lentils (+8 g), oats for breakfast (+4 g per 40 g), berries, or swap white bread/rice for wholegrain. Increase gradually and drink more water to avoid bloating.' });
  for (const k of ['sugar', 'satFat', 'sodium'] as const) {
    if (onProtocol && k !== 'sugar') continue; // animal fats and 'salt to taste' are part of the protocol
    const lim = micro[k];
    if (lim && (avg[k] ?? 0) > lim.value * 1.1 && coverage(k) > 0.6) {
      const label = k === 'satFat' ? 'Saturated fat' : k === 'sodium' ? 'Sodium (salt)' : 'Sugar';
      quality.push({ title: `${label} above the limit`, detail: `Avg ${Math.round(avg[k] ?? 0)} vs max ${lim.value}${k === 'sodium' ? ' mg' : ' g'}. Biggest sources: ${topBy(k)}.` });
    }
  }
  for (const k of ['iron', 'calcium', 'vitD', 'potassium', 'magnesium', 'vitB12'] as const) {
    const tgt = micro[k];
    if (quality.length >= 5 || onProtocol) break;
    if (tgt && (avg[k] ?? 0) < tgt.value * 0.6 && coverage(k) > 0.7)
      quality.push({ title: `Low ${k === 'vitD' ? 'vitamin D' : k === 'vitB12' ? 'vitamin B12' : k}`, detail: `About ${Math.round(((avg[k] ?? 0) / tgt.value) * 100)}% of the reference value. Good sources: ${MICRO_FOODS[k]}.` });
  }
  const plantsThisWeek = new Set(
    s.entries.filter((e) => e.date > addDays(t, -7)).filter((e) => ['fruit', 'veg', 'legume', 'nuts', 'starch'].includes(foodCategory(s, e))).map((e) => e.foodId),
  ).size;
  if (!onProtocol && plantsThisWeek < 15 && logged.length >= 5) quality.push({ title: `${plantsThisWeek} different plant foods this week`, detail: 'Variety feeds a more diverse gut microbiome. Research links ~30 different plants a week (fruit, veg, legumes, whole grains, nuts, seeds, herbs) to better gut health. Try a frozen veg mix or a new legume each week.' });

  // ---- Training ----
  const training: Tip[] = [];
  const strengthPerWeek = weeks4.filter((x) => sessionKind(x) !== 'Cardio').length / 4;
  if (p.goal === 'cut' && strengthPerWeek < 2) training.push({ title: 'Keep lifting while you cut', detail: `You average ${strengthPerWeek.toFixed(1)} strength sessions/week. 2–4 heavy sessions tell your body to keep muscle while fat comes off.` });
  if (p.goal === 'bulk' && strengthPerWeek < 3) training.push({ title: 'More training to build muscle', detail: `You average ${strengthPerWeek.toFixed(1)} strength sessions/week. Aim for 3–5 with progressive overload, or the extra calories go mostly to fat.` });

  // ---- Verdict ----
  const enough = logged.length >= 3;
  const fmtRate = (r: number) => `${r > 0 ? '+' : ''}${r.toFixed(2)} kg/week`;
  let verdict: Analysis['verdict'];
  if (!enough) verdict = { tone: 'info', title: 'Keep logging', text: `Log at least 3 full days (you have ${logged.length} in the last ${windowDays}) and weigh in a few times a week for personal advice.` };
  else if (Math.abs(gap) <= 75) verdict = { tone: 'good', title: 'On track 👍', text: gapSource === 'trend' ? `Your weight trend (${fmtRate(trend!.kgPerWeek)}) matches your goal (${fmtRate(goalRate)}). Keep doing what you're doing.` : `You're eating ${Math.round(avgKcal)} kcal/day vs a ${Math.round(avgTarget)} target. Weigh in 3+ times a week so I can confirm with your real trend.` };
  else if (gap > 0) verdict = {
    tone: 'warn',
    title: p.goal === 'cut' ? 'Losing slower than planned' : p.goal === 'bulk' ? 'Gaining faster than planned' : 'Slowly gaining weight',
    text: gapSource === 'trend' ? `Trend ${fmtRate(trend!.kgPerWeek)} vs goal ${fmtRate(goalRate)} → about ${gap} kcal/day too much.${p.goal === 'bulk' ? ' Gaining too fast mostly adds fat.' : ''}` : `You average ${Math.round(avgKcal)} kcal/day vs a ${Math.round(avgTarget)} target → ${gap} kcal/day over.`,
  };
  else verdict = {
    tone: 'warn',
    title: p.goal === 'cut' ? 'Losing faster than planned' : p.goal === 'bulk' ? 'Not gaining enough' : 'Slowly losing weight',
    text: gapSource === 'trend' ? `Trend ${fmtRate(trend!.kgPerWeek)} vs goal ${fmtRate(goalRate)} → about ${-gap} kcal/day too little.${p.goal === 'cut' ? ' Losing too fast costs muscle and energy.' : ''}` : `You average ${Math.round(avgKcal)} kcal/day vs a ${Math.round(avgTarget)} target → ${-gap} kcal/day under.`,
  };

  return {
    windowDays, loggedDays: logged.length, weighIns: s.body.filter((b) => b.weightKg && b.date > addDays(t, -28)).length, enough, goal: p.goal, goalRate,
    avgKcal, avgTarget, avgProtein: avg.protein ?? 0, proteinTarget, avg, trend, formulaMaintenance: Math.round(tdee(p)), measuredMaintenance, suggestedBase,
    gap, gapSource, verdict, eatLess, eatMore, moveMore, protein, quality, training, topFoods: topFoods.slice(0, 8), plantsThisWeek,
  };
}
