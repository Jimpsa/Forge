// Diet-plan builder: a nutrient-dense week of meals for a diet style, tied to the training schedule.
//
// - Calories and macros come from your targets (training days get the extra carbs, rest days don't).
// - Protein is spread over 3–5 meals (~0.3–0.5 g/kg each), with a protein-rich meal after training.
// - Training days get a carb-based pre-workout snack placed before your usual training time.
// - Meals are built from protein + carb + vegetables + fat (+ fruit) and portions are solved to hit targets.
// - Variety rotates through the week (fish twice a week where allowed, different vegetables daily).
import type { AppState, Food, MealItem, PlannedDay, PlannedMeal, NutrientKey, Nutrients } from '../types';
import { NUTRIENTS } from '../types';
import { BUILTIN_FOODS } from '../data/foods';
import { dailyTargets, microTargets, scale, sum } from './nutrition';
import { activeTest, allowedNow, itemByKey, itemFood, yogurtToday } from './protocol';
import { SCHEDULE } from '../data/programs';
import { avoidInElimination } from '../data/histamine';
import { ITEM_FOODS } from './protocol';
const ITEM_TEST_GRAMS = (key: string) => ITEM_FOODS[key]?.testGrams ?? 30;

export type DietStyle = 'balanced' | 'pescetarian' | 'vegetarian' | 'vegan' | 'keto' | 'carnivore' | 'protocol';
export type TrainTime = 'morning' | 'midday' | 'evening';

export const STYLES: { key: DietStyle; label: string; blurb: string }[] = [
  { key: 'balanced', label: 'Balanced', blurb: 'Everything in moderation: meat, fish, dairy, grains, plenty of plants.' },
  { key: 'pescetarian', label: 'Pescetarian', blurb: 'Fish and seafood, eggs and dairy. No meat.' },
  { key: 'vegetarian', label: 'Vegetarian', blurb: 'Eggs and dairy. No meat or fish.' },
  { key: 'vegan', label: 'Vegan', blurb: 'Plants only: soy, legumes, grains, nuts and seeds.' },
  { key: 'keto', label: 'Keto', blurb: 'Very low carb (~30 g/day), higher fat, adequate protein.' },
  { key: 'carnivore', label: 'Carnivore', blurb: 'Animal foods only: meat, fish, eggs, some dairy.' },
  { key: 'protocol', label: 'Gut reset', blurb: 'Only the foods allowed in your current gut-reset phase.' },
];

const MEAT = /(beef|steak|pork|lamb|chicken|turkey|bacon|ham\b|sausage|meatball|mince|tallow|lard|duck|salami|chorizo|liver)/i;
const FISH = /(salmon|cod|tuna|shrimp|prawn|mackerel|herring|trout|sardine|pollock|mussel|fish)/i;
const EGG = /\begg/i;
const DAIRY = /(\bmilk\b|milk,|yog(h)?urt|skyr|quark|kvarg|cottage|cheese|cream|\bbutter\b|whey|casein|kefir|halloumi|feta|mozzarella|parmesan|filmjölk)/i;
const NOT_DAIRY = /(peanut butter|oat drink|soy drink|soy yogurt|coconut|almond)/i;
const isDairy = (n: string) => DAIRY.test(n) && !NOT_DAIRY.test(n);

function fits(style: DietStyle, name: string, s: AppState): boolean {
  switch (style) {
    case 'pescetarian': return !MEAT.test(name);
    case 'vegetarian': return !MEAT.test(name) && !FISH.test(name);
    case 'vegan': return !MEAT.test(name) && !FISH.test(name) && !EGG.test(name) && !isDairy(name) && !/honey/i.test(name);
    case 'carnivore': return MEAT.test(name) || FISH.test(name) || EGG.test(name) || /(butter|cheese|tallow|lard)/i.test(name);
    case 'protocol': {
      // The food under test appears only as the measured daily test portion, never in regular meals.
      const tested = s.protocol ? activeTest(s.protocol) : undefined;
      if (tested && itemByKey(tested.food)?.re.test(name)) return false;
      return allowedNow(s, name);
    }
    default: return true;
  }
}

// Ingredient pools by role (names must exist in the food database).
const P = {
  bProtein: ['Egg, whole', 'Skyr, plain', 'Greek yogurt, plain, 0%', 'Quark / kvarg, low fat', 'Cottage cheese 2%', 'Tofu, firm', 'Smoked salmon', 'Whey protein powder', 'Pea protein powder', 'Bacon, cooked (crispy)', 'Beef steak, cooked'],
  bCarb: ['Oats, rolled (dry)', 'Whole wheat bread', 'Rye bread', 'Muesli, unsweetened', 'Sourdough bread', 'Crispbread, rye', 'Granola'],
  fruit: ['Blueberries', 'Banana', 'Strawberries', 'Raspberries', 'Apple', 'Orange', 'Kiwi', 'Pear', 'Mango'],
  ketoFruit: ['Raspberries', 'Strawberries', 'Blueberries'],
  bFat: ['Walnuts', 'Almonds', 'Peanut butter', 'Avocado', 'Chia seeds', 'Flaxseed'],
  main: ['Chicken breast, cooked', 'Ground beef 10% fat, cooked', 'Salmon, cooked', 'Pork tenderloin, cooked', 'Turkey breast, cooked', 'Cod, cooked', 'Beef steak, cooked', 'Chicken thigh, cooked, skinless', 'Tuna, canned in water', 'Lamb, cooked', 'Shrimp, cooked'],
  fishMain: ['Salmon, cooked', 'Cod, cooked', 'Mackerel, raw', 'Tuna, canned in water', 'Shrimp, cooked', 'Sardines in oil, drained', 'Rainbow trout, raw'],
  vegMain: ['Tofu, firm', 'Tempeh', 'Lentils, cooked', 'Chickpeas, cooked', 'Seitan', 'Black beans, cooked', 'Halloumi', 'Egg, whole', 'Cottage cheese 2%', 'Kidney beans, cooked', 'Edamame'],
  carb: ['White rice, cooked', 'Potato, boiled', 'Pasta, cooked', 'Quinoa, cooked', 'Sweet potato, baked', 'Brown rice, cooked', 'Bulgur, cooked', 'Wholegrain pasta, cooked', 'Couscous, cooked'],
  veg: ['Broccoli', 'Carrot', 'Red bell pepper', 'Spinach, raw', 'Tomato', 'Green beans, cooked', 'Zucchini, raw', 'Cauliflower', 'Mixed salad greens', 'Kale', 'Mushrooms', 'Brussels sprouts', 'Asparagus', 'Cucumber', 'White cabbage', 'Beetroot, cooked'],
  ketoVeg: ['Broccoli', 'Spinach, raw', 'Zucchini, raw', 'Cauliflower', 'Mixed salad greens', 'Mushrooms', 'Asparagus', 'Cucumber', 'Kale', 'Green beans, cooked'],
  fat: ['Olive oil', 'Rapeseed / canola oil', 'Avocado'],
  ketoFat: ['Olive oil', 'Butter', 'Avocado'],
  animalFat: ['Butter', 'Beef tallow', 'Lard', 'Duck fat'],
  snackProtein: ['Skyr, plain', 'Cottage cheese 2%', 'Whey protein powder', 'Greek yogurt, plain, 0%', 'Edamame', 'Pea protein powder', 'Egg, whole', 'Quark / kvarg, low fat', 'Tofu, firm'],
  snackCarb: ['Banana', 'Apple', 'Rice cakes', 'Orange', 'Pear'],
  snackFat: ['Almonds', 'Walnuts', 'Cashews', 'Peanut butter', 'Pumpkin seeds'],
  preCarb: ['Banana', 'Rice cakes', 'White bread', 'Oats, rolled (dry)'],
  extraCarb: ['Jam', 'Honey'],
};

const food = (name: string) => BUILTIN_FOODS.find((f) => f.name === name);
const per = (f: Food, k: NutrientKey) => (f.per100[k] ?? 0) / 100;

interface Slot { key: string; label: string; share: number; kind: 'breakfast' | 'main' | 'snack' | 'pre'; post?: boolean }

function slots(meals: number, training: boolean, time: TrainTime): Slot[] {
  const base: Slot[] = meals === 3
    ? [{ key: 'breakfast', label: 'Breakfast', share: 0.3, kind: 'breakfast' }, { key: 'lunch', label: 'Lunch', share: 0.35, kind: 'main' }, { key: 'dinner', label: 'Dinner', share: 0.35, kind: 'main' }]
    : meals === 4
      ? [{ key: 'breakfast', label: 'Breakfast', share: 0.25, kind: 'breakfast' }, { key: 'lunch', label: 'Lunch', share: 0.3, kind: 'main' }, { key: 'snack', label: 'Snack', share: 0.15, kind: 'snack' }, { key: 'dinner', label: 'Dinner', share: 0.3, kind: 'main' }]
      : [{ key: 'breakfast', label: 'Breakfast', share: 0.22, kind: 'breakfast' }, { key: 'snack', label: 'Morning snack', share: 0.1, kind: 'snack' }, { key: 'lunch', label: 'Lunch', share: 0.26, kind: 'main' }, { key: 'snack', label: 'Afternoon snack', share: 0.14, kind: 'snack' }, { key: 'dinner', label: 'Dinner', share: 0.28, kind: 'main' }];
  if (!training) return base;
  // Insert a pre-workout snack (taken from the other meals' shares) and mark the next meal as post-workout.
  const pre: Slot = { key: 'snack', label: 'Pre-workout snack', share: 0.1, kind: 'pre' };
  const out = base.map((x) => ({ ...x, share: x.share * 0.9 }));
  const at = time === 'morning' ? 0 : time === 'midday' ? out.findIndex((x) => x.key === 'lunch') : out.findIndex((x) => x.key === 'dinner');
  out.splice(at, 0, pre);
  if (out[at + 1]) out[at + 1] = { ...out[at + 1], post: true, label: out[at + 1].label + ' (after training)' };
  return out;
}

export interface PlanInputs { style: DietStyle; meals: 3 | 4 | 5; trainTime: TrainTime; seed: number }

export interface DayTotals { n: Nutrients; target: { kcal: number; protein: number; carbs: number; fat: number } }

function targetsFor(s: AppState, style: DietStyle, training: boolean) {
  const t = dailyTargets(s.profile, training);
  if (style === 'keto') { const carbs = 30; const fat = Math.max(t.fat, (t.kcal - t.protein * 4 - carbs * 4) / 9); return { kcal: t.kcal, protein: t.protein, carbs, fat: Math.round(fat) }; }
  if (style === 'carnivore') { const carbs = 5; return { kcal: t.kcal, protein: t.protein, carbs, fat: Math.round((t.kcal - t.protein * 4 - carbs * 4) / 9) }; }
  if (style === 'vegan') { const protein = Math.round(t.protein * 1.1); return { kcal: t.kcal, protein, carbs: Math.max(0, Math.round((t.kcal - protein * 4 - t.fat * 9) / 4)), fat: t.fat }; }
  return { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat };
}

const round5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);
function clampFor(f: Food, role: string, g: number) {
  const sv = f.servings[0]?.grams ?? 100;
  const dry = /(dry|powder|oats|muesli|granola|rice cakes|crispbread|bread|seeds|nuts|almond|walnut|cashew|peanut)/i.test(f.name);
  const lo = role === 'protein' ? Math.max(30, sv * 0.5) : role === 'carb' ? (dry ? 20 : 50) : 5;
  const seedNut = /(seeds|nuts|almond|walnut|cashew|peanut|chia|flax)/i.test(f.name);
  const hi = role === 'protein' ? (/(powder)/i.test(f.name) ? 60 : Math.min(300, Math.max(sv * 3, 250))) : role === 'carb' ? (dry ? 140 : 450) : role === 'fat' ? (/(oil|butter|tallow|lard|fat)/i.test(f.name) ? 45 : seedNut ? 40 : 200) : 400;
  return Math.min(hi, Math.max(lo, g));
}

/** Solve gram amounts so a meal hits its kcal and protein share. */
function solveMeal(parts: { role: 'protein' | 'carb' | 'fat' | 'veg' | 'fruit'; food: Food; grams: number }[], kcal: number, protein: number, flexFat: boolean) {
  for (let it = 0; it < 6; it++) {
    const pr = parts.find((p) => p.role === 'protein');
    const flex = parts.find((p) => p.role === 'carb') ?? (flexFat ? parts.find((p) => p.role === 'fat') : undefined);
    if (pr) {
      const others = parts.filter((p) => p !== pr).reduce((a, p) => a + per(p.food, 'protein') * p.grams, 0);
      const dens = per(pr.food, 'protein');
      if (dens > 0) pr.grams = clampFor(pr.food, 'protein', (protein - others) / dens);
    }
    if (flex) {
      const others = parts.filter((p) => p !== flex).reduce((a, p) => a + per(p.food, 'kcal') * p.grams, 0);
      const dens = per(flex.food, 'kcal');
      if (dens > 0) flex.grams = clampFor(flex.food, flex.role, (kcal - others) / dens);
    }
  }
  return parts.map((p) => ({ ...p, grams: /egg, whole/i.test(p.food.name) ? Math.max(50, Math.round(p.grams / 50) * 50) : round5(p.grams) }));
}

export function buildMealPlan(s: AppState, inp: PlanInputs): { days: PlannedDay[]; notes: string[] } {
  const style = inp.style;
  const histOn = !!s.settings?.histamine;
  const ok = (name: string) => !!food(name) && fits(style, name, s) && !(histOn && avoidInElimination(name));
  const pool = (names: string[]) => names.filter(ok);
  const pick = <T,>(arr: T[], i: number) => arr[((i % arr.length) + arr.length) % arr.length];
  const keto = style === 'keto', carni = style === 'carnivore';
  const proto = style === 'protocol';
  const protoPhase = s.protocol?.phase ?? 3;
  const trainDays = s.program?.weekdays ?? SCHEDULE[3];
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const mains = (() => {
    if (style === 'vegan') return pool(P.vegMain);
    if (style === 'vegetarian') return pool(P.vegMain);
    if (style === 'pescetarian') return [...pool(P.fishMain), ...pool(['Egg, whole', 'Tofu, firm', 'Halloumi', 'Lentils, cooked'])];
    return pool(P.main);
  })();
  const fishMains = pool(P.fishMain);
  const carbs = keto || carni ? [] : pool(P.carb);
  const vegs = carni ? [] : pool(keto ? P.ketoVeg : P.veg);
  const fats = carni ? pool(P.animalFat) : keto ? pool(P.ketoFat) : pool(proto ? [...P.fat, ...P.animalFat] : P.fat);
  let fruits = carni ? [] : pool(keto ? P.ketoFruit : P.fruit);
  let vegsP = vegs, fatsP = fats, mainsP = mains;

  // Gut reset: build from the protocol itself — tolerated foods in their protocol preparation,
  // the food currently being tested as a small daily test portion, and the yogurt ramp in phase 3.
  const pr = proto ? s.protocol : undefined;
  const okFoods = (group?: 'veg' | 'fruit') => (pr ? pr.tests.filter((x) => x.result === 'ok').map((x) => itemByKey(x.food)).filter((it) => it && (group ? it.group === group : true)).map((it) => itemFood(pr, it!.key)!).filter((n) => !!food(n)) : []);
  const tested = pr ? activeTest(pr) : undefined;
  const testFood = pr && tested ? itemFood(pr, tested.food) : undefined;
  if (pr) {
    const ok = new Set(pr.tests.filter((x) => x.result === 'ok').map((x) => x.food));
    vegsP = pr.phase >= 3 ? [...new Set([...okFoods('veg'), ...vegs])] : okFoods('veg');
    fruits = pr.phase >= 3 ? [...new Set([...okFoods('fruit'), ...fruits])] : okFoods('fruit');
    fatsP = [...pool(['Beef tallow', 'Lard', 'Duck fat']), ...(ok.has('butter') ? [itemFood(pr, 'butter')!] : []), ...(pr.phase >= 3 ? pool(P.fat) : [])].filter((n) => !!food(n));
    if (ok.has('tartare')) mainsP = [...mains, itemFood(pr, 'tartare')!];
  }
  const protoExtras = pr ? { cheese: pr.tests.some((x) => x.food === 'cheese' && x.result === 'ok') ? itemFood(pr, 'cheese') : undefined,
    milk: pr.tests.some((x) => x.food === 'milk' && x.result === 'ok') ? itemFood(pr, 'milk') : undefined,
    ferments: pr.tests.filter((x) => x.result === 'ok' && ['kefir', 'sauerkraut', 'kimchi'].includes(x.food)).map((x) => itemFood(pr, x.food)!),
    yogurtGrams: (yogurtToday(pr)?.tbsp ?? 0) * 15 } : undefined;

  const days: PlannedDay[] = weekdays.map((wd, di) => {
    const training = trainDays.includes(wd);
    const target = targetsFor(s, style, training);
    const sl = slots(inp.meals, training, inp.trainTime);
    const k = di + inp.seed * 3;
    const meals: PlannedMeal[] = sl.map((slot, si) => {
      const kcal = target.kcal * slot.share;
      const protein = target.protein * slot.share * (slot.post ? 1.15 : 1) * (slot.kind === 'pre' ? 0.6 : 1);
      type Part = { role: 'protein' | 'carb' | 'fat' | 'veg' | 'fruit'; food: Food; grams: number };
      const parts: Part[] = [];
      const add = (role: Part['role'], name: string | undefined, grams: number) => { const f = name ? food(name) : undefined; if (f && !parts.some((p) => p.food.id === f.id)) parts.push({ role, food: f, grams }); };
      if (slot.kind === 'breakfast') {
        const bp = pool(P.bProtein);
        add('protein', pick(bp.length ? bp : mainsP, k + si), 150);
        if (!keto && !carni) add('carb', pick(pool(P.bCarb).length ? pool(P.bCarb) : carbs, k), 60);
        if (fruits.length) add('fruit', pick(fruits, k + 1), keto ? 50 : 100);
        add('fat', pick(pool(P.bFat).length && !carni ? pool(P.bFat) : fatsP, k + 2), 15);
        if (protoExtras?.yogurtGrams) { add('veg', 'L. reuteri yogurt (homemade)', protoExtras.yogurtGrams); }
        if (keto || carni) add('protein', pick(pool(['Egg, whole', 'Bacon, cooked (crispy)']), k), 100);
      } else if (slot.kind === 'main') {
        const fishDay = !['vegan', 'vegetarian'].includes(style) && fishMains.length && (di === 1 || di === 4) && slot.key === 'dinner';
        add('protein', fishDay && !pr ? pick(fishMains, k) : pick(mainsP, k * 2 + si), 150);
        if (carbs.length) add('carb', pick(carbs, k + si), 200);
        if (vegsP.length) { add('veg', pick(vegsP, k * 2 + si), 120); if (vegsP.length > 1) add('veg', pick(vegsP, k * 2 + si + 5), 100); }
        if (fatsP.length) add('fat', pick(fatsP, k + si), keto ? 25 : 10);
        if (protoExtras?.ferments.length && slot.key === 'dinner') add('veg', pick(protoExtras.ferments, k), /kefir/i.test(pick(protoExtras.ferments, k)) ? 150 : 15);
      } else if (slot.kind === 'pre') {
        // Keto/carnivore: no starchy carbs before training (a few berries at most on keto).
        let pc = keto ? pool(P.ketoFruit) : carni ? [] : pool(P.preCarb);
        if (!pc.length && !keto && !carni) pc = carbs; // e.g. gut reset phase 1: rice or potato
        if (pc.length) add(keto ? 'fruit' : 'carb', pick(pc, k), keto ? 60 : 100);
        const sp = pool(P.snackProtein);
        if (sp.length) add('protein', pick(sp, k + 1), 150);
        else if (mains.length) add('protein', pick(mains, k), 80);
      } else {
        const sp = pool(P.snackProtein);
        add('protein', pick(sp.length ? sp : mains, k + si), 150);
        if (!keto && !carni) { const sc = pool(P.snackCarb); if (sc.length) add('carb', pick(sc, k + si), 120); }
        if (keto) add('fat', pick(pool(['Hard cheese 28% (Gouda-type)', 'Walnuts', 'Almonds']), k), 30);
        const sf = pool(P.snackFat); if (sf.length && !carni) add('fat', pick(sf, k), 20);
        if (protoExtras?.cheese) add('fat', protoExtras.cheese, 25);
        if (protoExtras?.milk) add('veg', protoExtras.milk, 150);
      }
      const isTestMeal = !!testFood && slot.kind === 'main' && sl.findIndex((x) => x.kind === 'main') === si;
      if (isTestMeal) add('veg', testFood, ITEM_TEST_GRAMS(tested!.food));
      const solved = solveMeal(parts, kcal, protein, keto || carni || !parts.some((p) => p.role === 'carb'));
      const items: MealItem[] = solved.map((p) => ({ foodId: p.food.id, name: p.food.name, grams: p.grams, ...(isTestMeal && p.food.name === testFood ? { test: true } : {}) }));
      const title = items.filter((x) => !x.test && solved.find((p) => p.food.id === x.foodId)!.role !== 'fat').slice(0, 3).map((x) => short(x.name)).join(' + ');
      return { slot: slot.label, title: (title || 'Meal') + (isTestMeal ? ` · 🧪 test: ${short(testFood!)}` : ''), items };
    });
    return { weekday: wd, training, meals };
  });

  // Day-level correction: nudge carb (or fat) portions so each day lands within ~5% of its calorie target.
  for (const d of days) {
    const target = targetsFor(s, style, d.training);
    const tot = dayTotals(d).kcal ?? 0;
    const diff = target.kcal - tot;
    if (Math.abs(diff) < target.kcal * 0.05) continue;
    const flexRole = keto || carni ? /(oil|butter|tallow|lard|fat|avocado|cheese)/i : /(rice|potato|pasta|quinoa|bulgur|couscous|oats|bread|banana)/i;
    const flex = d.meals.flatMap((m) => m.items).filter((x) => flexRole.test(x.name) && !x.test);
    const flexKcal = flex.reduce((a, x) => a + ((food(x.name)?.per100.kcal ?? 0) * x.grams) / 100, 0);
    if (flexKcal > 0) { const f = Math.max(0.5, Math.min(1.8, 1 + diff / flexKcal)); flex.forEach((x) => { x.grams = round5(x.grams * f); }); }
  }

  const notes = dietNotes(style, s, protoPhase, days);
  return { days, notes };
}

const short = (name: string) => name.split(',')[0].replace(/\s*\(.*\)$/, '');

export function dayTotals(d: PlannedDay): Nutrients {
  return sum(d.meals.flatMap((m) => m.items).map((x) => { const f = food(x.name); return f ? scale(f.per100, x.grams) : {}; }));
}

export function dayTarget(s: AppState, style: DietStyle, training: boolean) { return targetsFor(s, style, training); }

/** Average % of reference values met across the week, for the key micronutrients. */
export function microCoverage(s: AppState, days: PlannedDay[]) {
  const avg: Nutrients = {};
  const totals = days.map(dayTotals);
  for (const { key } of NUTRIENTS) avg[key] = totals.reduce((a, n) => a + (n[key] ?? 0), 0) / totals.length;
  const ref = microTargets(s.profile, avg.kcal ?? 2000);
  const keys: NutrientKey[] = ['fiber', 'calcium', 'iron', 'magnesium', 'potassium', 'zinc', 'vitA', 'vitC', 'vitD', 'vitB12'];
  return keys.filter((k) => ref[k]).map((k) => ({ key: k, label: NUTRIENTS.find((n) => n.key === k)!.label, pct: Math.round(((avg[k] ?? 0) / ref[k]!.value) * 100) }));
}

function dietNotes(style: DietStyle, s: AppState, phase: number, days: PlannedDay[]): string[] {
  const trainCount = days.filter((d) => d.training).length;
  const common = [
    s.program ? `Built around your program: ${trainCount} training days (${days.filter((d) => d.training).map((d) => d.weekday).join(', ')}) get extra carbs and a pre-workout snack; rest days are lighter.` : `Assumes 3 training days (Mon, Wed, Fri). Build a training program and the plan follows its schedule automatically.`,
    `Protein is spread across the day, with the most right after training. That supports muscle repair and keeps you full.`,
  ];
  const specific: Record<DietStyle, string[]> = {
    balanced: ['Fish twice a week for omega-3. Rotating vegetables, fruit and whole grains cover most vitamins and fiber.'],
    pescetarian: ['Fish and seafood cover protein, omega-3, vitamin D and B12. Aim for oily fish (salmon, mackerel, sardines) at least twice a week.'],
    vegetarian: ['Eggs and dairy cover B12 and calcium. Pair iron sources (lentils, tofu, spinach) with vitamin C (peppers, citrus) for better absorption.', 'Many vegetarians benefit from an omega-3 (algae) supplement and vitamin D in winter. Check with a doctor or pharmacist.'],
    vegan: ['Protein target set 10% higher, because plant proteins are slightly less digestible. Soy, tempeh, seitan and legumes are the best sources, and mixing them through the day covers all amino acids.', 'Vegans need a vitamin B12 supplement. Also consider vitamin D, an algae omega-3 and iodine, and choose calcium-fortified drinks and yogurts. A blood test now and then is a good idea.'],
    keto: ['Carbs kept around 30 g a day. Training performance often dips for 2–4 weeks while you adapt, especially in high-rep or sprint work.', 'Low-carb diets lose water and salt: salt your food, and eat potassium and magnesium-rich foods (avocado, spinach, nuts). Fiber can run low, so keep the vegetables in.'],
    carnivore: ['Animal foods only, so fiber and vitamin C are close to zero and calcium can be low. Fresh meat provides a little vitamin C; liver or eggs add vitamin A. There is little long-term research on this diet.', 'Consider blood work (lipids, kidney values) if you stay on it for long. Keep salt and water up.'],
    protocol: [`Built from your gut-reset protocol (phase ${phase}): only the foods your phase allows, in their protocol preparation. The plan updates itself when your phase changes, a test ends or a food is tolerated.`, 'The food you are currently testing appears once a day as a small 🧪 test portion. Log how you feel in the daily check-in.', phase === 1 ? 'Phase 1 is meat, eggs, animal fats, fresh white rice and peeled potatoes, so fiber, vitamin C and calcium are low by design for a few weeks.' : 'Keep testing one new food at a time. Reintroduced foods appear in rebuilt plans automatically.'],
  };
  const hist = s.settings?.histamine ? ['Histamine-aware: high-histamine foods, liberators and DAO blockers are left out. Eat meat and fish fresh, and freeze leftovers right away instead of keeping them in the fridge.'] : [];
  return [...common, ...specific[style], ...hist];
}

/** Total grams per food for the week (shopping list). */
export function shoppingList(days: PlannedDay[]) {
  const m = new Map<string, { name: string; grams: number }>();
  for (const d of days) for (const meal of d.meals) for (const x of meal.items) {
    const cur = m.get(x.foodId) ?? { name: x.name, grams: 0 };
    cur.grams += x.grams; m.set(x.foodId, cur);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** "2 large eggs" style label when an item is close to a whole number of servings. */
export function portionLabel(name: string, grams: number) {
  const f = food(name);
  const sv = f?.servings[0];
  if (!sv || sv.grams < 8) return `${grams} g`;
  const n = grams / sv.grams;
  const r = Math.round(n * 2) / 2;
  if (r >= 0.5 && Math.abs(n - r) < 0.15 && r <= 6) return `${r === 0.5 ? '½' : r} × ${sv.label.replace(/^1\s+/, '')} (${grams} g)`;
  return `${grams} g`;
}

/** Net carbs (carbs minus fiber), the number keto targets refer to. */
export const netCarbs = (n: Nutrients) => Math.max(0, (n.carbs ?? 0) - (n.fiber ?? 0));
