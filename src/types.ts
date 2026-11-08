// ---------- Nutrition ----------

export const NUTRIENTS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'fiber', label: 'Fiber', unit: 'g' },
  { key: 'sugar', label: 'Sugar', unit: 'g' },
  { key: 'satFat', label: 'Saturated fat', unit: 'g' },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'potassium', label: 'Potassium', unit: 'mg' },
  { key: 'calcium', label: 'Calcium', unit: 'mg' },
  { key: 'iron', label: 'Iron', unit: 'mg' },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg' },
  { key: 'zinc', label: 'Zinc', unit: 'mg' },
  { key: 'vitA', label: 'Vitamin A', unit: 'µg' },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg' },
  { key: 'vitD', label: 'Vitamin D', unit: 'µg' },
  { key: 'vitB12', label: 'Vitamin B12', unit: 'µg' },
] as const;

export type NutrientKey = (typeof NUTRIENTS)[number]['key'];
export type Nutrients = Partial<Record<NutrientKey, number>>;

export interface Serving { label: string; grams: number }

export interface Food {
  id: string;
  name: string;
  brand?: string;
  per100: Nutrients; // per 100 g (or 100 ml)
  servings: Serving[];
  source: 'builtin' | 'custom' | 'off' | 'recipe';
  barcode?: string;
  ingredients?: { foodId: string; grams: number }[]; // recipes only
  favorite?: boolean;
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

export interface FoodEntry {
  id: string;
  date: string; // YYYY-MM-DD
  meal: Meal;
  foodId: string;
  name: string; // snapshot
  grams: number;
  nutrients: Nutrients; // snapshot for this amount, so editing a food never rewrites history
}

// ---------- Training ----------

export type MuscleGroup = 'Chest' | 'Back' | 'Shoulders' | 'Biceps' | 'Triceps' | 'Legs' | 'Glutes' | 'Core' | 'Full body';

export interface Exercise {
  id: string;
  name: string;
  muscle: MuscleGroup;
  equipment: string;
  custom?: boolean;
}

export interface SetLog { reps: number; weight: number; rpe?: number; done: boolean; warmup?: boolean }

export interface ExerciseLog { exerciseId: string; sets: SetLog[]; notes?: string; restSec?: number }

export type CardioActivity = 'run' | 'cycle' | 'row' | 'swim' | 'walk' | 'elliptical' | 'hiit' | 'other';

export interface CardioLog {
  activity: CardioActivity;
  durationMin: number;
  distanceKm?: number;
  avgHr?: number;
  elevationM?: number;
}

export interface Session {
  id: string;
  date: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  durationMin: number;
  rpe: number; // session RPE 1–10 ("how hard was the whole session")
  exercises: ExerciseLog[];
  cardio: CardioLog[];
  notes?: string;
}

export interface TemplateExercise { exerciseId: string; sets: number; reps: number; restSec: number }
export interface Template { id: string; name: string; exercises: TemplateExercise[] }

export interface ActiveWorkout {
  name: string;
  startedAt: number;
  exercises: ExerciseLog[];
  cardio: CardioLog[];
  restEndsAt?: number;
  restSec: number;
}

// ---------- Body & profile ----------

export interface BodyEntry { date: string; weightKg?: number; bodyFatPct?: number; waistCm?: number }

export type Goal = 'cut' | 'maintain' | 'bulk';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very';

export interface Profile {
  name: string;
  sex: 'male' | 'female';
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: Goal;
  rateKgPerWeek: number; // for cut/bulk
  proteinPerKg: number;
  fatPct: number; // % of calories from fat
  trainingDayKcal: number; // extra kcal (from carbs) on days with a workout
  waterGoalMl: number;
  maxHr?: number;
  kcalOverride?: number;
}

export interface AppState {
  version: 1;
  onboarded: boolean;
  profile: Profile;
  foods: Food[]; // custom, saved-from-OFF and recipes (builtins live in code)
  entries: FoodEntry[];
  water: Record<string, number>; // date -> ml
  exercises: Exercise[]; // custom only
  templates: Template[];
  sessions: Session[];
  active?: ActiveWorkout;
  body: BodyEntry[];
}
