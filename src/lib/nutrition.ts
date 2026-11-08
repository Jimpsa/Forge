import type { AppState, Food, FoodEntry, NutrientKey, Nutrients, Profile } from '../types';
import { NUTRIENTS } from '../types';
import { BUILTIN_FOODS } from '../data/foods';
import { today } from './util';

export const ACTIVITY_FACTORS: Record<Profile['activity'], { f: number; label: string }> = {
  sedentary: { f: 1.2, label: 'Sedentary (desk job, little movement)' },
  light: { f: 1.375, label: 'Light (some walking, on feet a bit)' },
  moderate: { f: 1.55, label: 'Moderate (active job or lots of steps)' },
  active: { f: 1.725, label: 'Active (physical job)' },
  very: { f: 1.9, label: 'Very active (heavy manual work)' },
};

export const age = (p: Profile) => new Date().getFullYear() - p.birthYear;

/** Mifflin–St Jeor resting energy expenditure. */
export function bmr(p: Profile) {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * age(p);
  return p.sex === 'male' ? base + 5 : base - 161;
}

/** Maintenance calories excluding planned training (training adds `trainingDayKcal` on workout days). */
export const tdee = (p: Profile) => bmr(p) * ACTIVITY_FACTORS[p.activity].f;

export interface Targets { kcal: number; protein: number; carbs: number; fat: number; trainingDay: boolean }

/** ~7700 kcal per kg of body weight change. */
export function dailyTargets(p: Profile, trainingDay: boolean): Targets {
  const delta = p.goal === 'cut' ? -(p.rateKgPerWeek * 7700) / 7 : p.goal === 'bulk' ? (p.rateKgPerWeek * 7700) / 7 : 0;
  let kcal = p.kcalOverride ?? (p.maintenanceKcal ?? tdee(p)) + delta;
  if (trainingDay) kcal += p.trainingDayKcal;
  kcal = Math.max(kcal, p.sex === 'male' ? 1500 : 1200);
  const protein = p.proteinPerKg * p.weightKg;
  const fat = (kcal * p.fatPct) / 100 / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return { kcal: Math.round(kcal), protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat), trainingDay };
}

/** Reference daily values. `limit` means "stay under", otherwise "reach at least". */
export function microTargets(p: Profile, kcal: number): Partial<Record<NutrientKey, { value: number; limit?: boolean }>> {
  const m = p.sex === 'male';
  return {
    fiber: { value: Math.round((14 * kcal) / 1000) },
    sugar: { value: Math.round((kcal * 0.1) / 4), limit: true },
    satFat: { value: Math.round((kcal * 0.1) / 9), limit: true },
    sodium: { value: 2300, limit: true },
    potassium: { value: m ? 3400 : 2600 },
    calcium: { value: 1000 },
    iron: { value: m ? 8 : 18 },
    magnesium: { value: m ? 420 : 320 },
    zinc: { value: m ? 11 : 8 },
    vitA: { value: m ? 900 : 700 },
    vitC: { value: m ? 90 : 75 },
    vitD: { value: 15 },
    vitB12: { value: 2.4 },
  };
}

export function scale(per100: Nutrients, grams: number): Nutrients {
  const out: Nutrients = {};
  for (const { key } of NUTRIENTS) if (per100[key] !== undefined) out[key] = (per100[key]! * grams) / 100;
  return out;
}

export function sum(list: Nutrients[]): Nutrients {
  const out: Nutrients = {};
  for (const n of list) for (const { key } of NUTRIENTS) if (n[key] !== undefined) out[key] = (out[key] ?? 0) + n[key]!;
  return out;
}

export const allFoods = (s: AppState): Food[] => {
  const ids = new Set(s.foods.map((f) => f.id)); // a saved copy (e.g. a favorited builtin) wins over the builtin
  return [...s.foods, ...BUILTIN_FOODS.filter((f) => !ids.has(f.id))];
};
export const findFood = (s: AppState, id: string) => allFoods(s).find((f) => f.id === id);
export const entriesFor = (s: AppState, date: string): FoodEntry[] => s.entries.filter((e) => e.date === date);
export const totalsFor = (s: AppState, date: string) => sum(entriesFor(s, date).map((e) => e.nutrients));
export const isTrainingDay = (s: AppState, date: string) => s.sessions.some((x) => x.date === date) || (!!s.active && date === today());

/** Per-100g nutrients of a recipe built from ingredients. */
export function recipePer100(s: AppState, ingredients: { foodId: string; grams: number }[]): Nutrients {
  const total = sum(ingredients.map((i) => { const f = findFood(s, i.foodId); return f ? scale(f.per100, i.grams) : {}; }));
  const grams = ingredients.reduce((a, i) => a + i.grams, 0) || 1;
  return scale(total, (100 * 100) / grams);
}
