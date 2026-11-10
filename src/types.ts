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
  keywords?: string; // extra search terms (e.g. Swedish names)
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

export interface ExerciseLog { exerciseId: string; sets: SetLog[]; notes?: string; restSec?: number; targetReps?: number }

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
  restTotal?: number; // seconds, for the countdown ring
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
  cycle?: CycleSettings;
  kcalOverride?: number;
  maintenanceKcal?: number; // measured from intake + weight trend (replaces the formula when set)
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
  gut?: GutLog[];
  protocol?: Protocol;
  chat?: ChatMessage[];
  periodStarts?: string[]; // first day of each period (YYYY-MM-DD)
  settings?: Settings;
  consent?: Consent;
  program?: SavedProgram;
  mealPlan?: SavedMealPlan;
  celebrated?: Celebrated;
}

export type Severity = 0 | 1 | 2 | 3; // none, mild, moderate, severe
export interface GutLog {
  date: string; bloating: Severity; pain: Severity; reflux: Severity; stool?: number; notes?: string;
  skin?: Severity; // eczema / itch / flare
  energy?: Severity; sleep?: Severity; mood?: Severity; // 0 poor … 3 great
  soreness?: Severity; // muscle soreness, 0 none … 3 severe
  period?: boolean; // menstruating today
  cycleSymptoms?: Severity; // cramps, PMS, headache …
  hist?: string[]; // histamine-type symptoms today (flush, itch, headache, nose, heart, dizzy)
  wellnessOnly?: boolean; // created by the readiness questions — gut fields not answered yet
}

export interface ReintroTest { id: string; food: string; start: string; result: 'testing' | 'ok' | 'reaction'; ended?: string; note?: string }
export interface Protocol {
  start: string;
  phase: 1 | 2 | 3;
  phaseStart: string;
  raw: boolean; // false = use high-quality cooked/pasteurised alternatives for the raw steps
  tests: ReintroTest[];
  yogurt?: { start: string; cap?: number };
}
export interface ChatMessage { role: 'user' | 'assistant'; content: string; at: number }

export interface CycleSettings {
  track: boolean;
  contraception: 'none' | 'hormonal'; // hormonal = pill, implant, hormonal IUD, ring …
  typicalLength: number; // days, used until there is enough logged data
}

export interface Settings {
  palette: 'ember' | 'green';
  mode: 'system' | 'dark' | 'light';
  celebrations: boolean;
  vibration: boolean;
  sounds: boolean;
  motion: 'system' | 'reduce' | 'full';
  histamine?: boolean; // histamine-aware mode (off by default)
}

/** Remembers which one-off celebrations were already shown, so they never repeat. */
export interface Celebrated {
  perfectDays?: string[]; // dates
  badges?: Record<string, string>; // badge id -> date earned
  recapSeen?: string; // week start of the last recap opened
  prepDone?: string[]; // gut-reset prep reminders the user ticked off
}

export interface SavedProgram {
  id: string;
  name: string;
  summary: string;
  createdAt: string; // date
  inputs: unknown; // ProgramInputs (kept loose to avoid a type cycle)
  templateIds: string[];
  weekdays: string[];
  notes: string[];
  weekly: Record<string, number>;
}

export interface MealItem { foodId: string; name: string; grams: number; test?: boolean }
export interface PlannedMeal { slot: string; title: string; items: MealItem[] }
export interface PlannedDay { weekday: string; training: boolean; meals: PlannedMeal[] }
export interface SavedMealPlan { id: string; style: string; createdAt: string; days: PlannedDay[]; notes: string[]; inputs?: { meals: 3 | 4 | 5; trainTime: 'morning' | 'midday' | 'evening'; seed: number }; protocolKey?: string }

/** Record of what the user agreed to (GDPR: consent must be demonstrable). */
export interface Consent { version: string; date: string; age16: boolean; terms: boolean; health: boolean }
