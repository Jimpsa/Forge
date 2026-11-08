import type { AppState, CardioLog, Exercise, Session, SetLog } from '../types';
import { BUILTIN_EXERCISES, CARDIO } from '../data/exercises';
import { addDays, today, weekStart } from './util';

export const allExercises = (s: AppState): Exercise[] => [...s.exercises, ...BUILTIN_EXERCISES];
export const exerciseName = (s: AppState, id: string) => allExercises(s).find((e) => e.id === id)?.name ?? 'Unknown exercise';

/** Epley estimated one-rep max. Only trusted up to ~12 reps. */
export const e1rm = (weight: number, reps: number) => (reps <= 0 || weight <= 0 ? 0 : reps === 1 ? weight : weight * (1 + reps / 30));

export const workingSets = (sets: SetLog[]) => sets.filter((x) => x.done && !x.warmup);

export const sessionVolume = (s: Session) =>
  s.exercises.reduce((a, ex) => a + workingSets(ex.sets).reduce((b, set) => b + set.reps * set.weight, 0), 0);

export const sessionSets = (s: Session) => s.exercises.reduce((a, ex) => a + workingSets(ex.sets).length, 0);

export function sessionKind(s: Pick<Session, 'exercises' | 'cardio'>): 'Strength' | 'Cardio' | 'Mixed' {
  const st = s.exercises.length > 0, ca = s.cardio.length > 0;
  return st && ca ? 'Mixed' : ca ? 'Cardio' : 'Strength';
}

/** Session training load = session RPE × minutes (Foster's sRPE method). Comparable across strength, running and mixed. */
export const sessionLoad = (s: Session) => s.rpe * s.durationMin;

/** Rough calories burned. Running uses ~1 kcal/kg/km; other cardio uses METs; lifting MET scales with effort. */
export function sessionKcal(s: Session, weightKg: number) {
  const cardioMin = s.cardio.reduce((a, c) => a + c.durationMin, 0);
  const cardioKcal = s.cardio.reduce((a, c) => a + cardioKcalOf(c, weightKg), 0);
  const liftMin = Math.max(0, s.durationMin - cardioMin);
  const liftMet = 3 + 0.35 * s.rpe; // ~3.5 easy → ~6.5 brutal
  return cardioKcal + (liftMet * weightKg * liftMin) / 60;
}

export function cardioKcalOf(c: CardioLog, weightKg: number) {
  if (c.activity === 'run' && c.distanceKm) return c.distanceKm * weightKg * 1.0;
  const met = CARDIO.find((x) => x.key === c.activity)?.met ?? 6;
  return (met * weightKg * c.durationMin) / 60;
}

export const pace = (c: CardioLog) => (c.distanceKm ? c.durationMin / c.distanceKm : undefined);

/** Best previous performance for each exercise, used for "last time" hints and PR detection. */
export function exerciseHistory(s: AppState, exerciseId: string) {
  return s.sessions
    .filter((x) => x.exercises.some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((x) => {
      const sets = workingSets(x.exercises.find((e) => e.exerciseId === exerciseId)!.sets);
      const best = sets.reduce((m, set) => Math.max(m, set.reps <= 12 ? e1rm(set.weight, set.reps) : 0), 0);
      const top = sets.reduce((m, set) => Math.max(m, set.weight), 0);
      const volume = sets.reduce((a, set) => a + set.weight * set.reps, 0);
      return { date: x.date, sessionId: x.id, sets, e1rm: best, topWeight: top, volume };
    });
}

export function detectPRs(s: AppState, session: Session) {
  const prs: { exerciseId: string; kind: 'e1RM' | 'Weight'; value: number }[] = [];
  for (const ex of session.exercises) {
    const prev = exerciseHistory(s, ex.exerciseId).filter((h) => h.sessionId !== session.id);
    const sets = workingSets(ex.sets);
    if (!sets.length) continue;
    const best = Math.max(...sets.map((x) => (x.reps <= 12 ? e1rm(x.weight, x.reps) : 0)));
    const top = Math.max(...sets.map((x) => x.weight));
    const prevBest = Math.max(0, ...prev.map((h) => h.e1rm));
    const prevTop = Math.max(0, ...prev.map((h) => h.topWeight));
    if (prev.length && best > prevBest) prs.push({ exerciseId: ex.exerciseId, kind: 'e1RM', value: best });
    else if (prev.length && top > prevTop) prs.push({ exerciseId: ex.exerciseId, kind: 'Weight', value: top });
  }
  return prs;
}

export interface WeekSummary { week: string; sessions: number; load: number; avgRpe: number; minutes: number; volume: number; runKm: number; strength: number; cardio: number; mixed: number }

export function weeklySummaries(s: AppState, weeks = 12): WeekSummary[] {
  const start = weekStart(today());
  const out: WeekSummary[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const w = addDays(start, -7 * i);
    const end = addDays(w, 7);
    const list = s.sessions.filter((x) => x.date >= w && x.date < end);
    const kinds = list.map(sessionKind);
    out.push({
      week: w,
      sessions: list.length,
      load: list.reduce((a, x) => a + sessionLoad(x), 0),
      avgRpe: list.length ? list.reduce((a, x) => a + x.rpe, 0) / list.length : 0,
      minutes: list.reduce((a, x) => a + x.durationMin, 0),
      volume: list.reduce((a, x) => a + sessionVolume(x), 0),
      runKm: list.reduce((a, x) => a + x.cardio.filter((c) => c.activity === 'run').reduce((b, c) => b + (c.distanceKm ?? 0), 0), 0),
      strength: kinds.filter((k) => k === 'Strength').length,
      cardio: kinds.filter((k) => k === 'Cardio').length,
      mixed: kinds.filter((k) => k === 'Mixed').length,
    });
  }
  return out;
}

/** Acute (last 7 days) vs chronic (last 28 days, per week) load. ~0.8–1.3 is the usual "sweet spot". */
export function loadRatio(s: AppState) {
  const t = today();
  const inRange = (from: string) => s.sessions.filter((x) => x.date > from && x.date <= t).reduce((a, x) => a + sessionLoad(x), 0);
  const acute = inRange(addDays(t, -7));
  const chronic = inRange(addDays(t, -28)) / 4;
  // Needs ~3 weeks of history before the comparison means anything.
  const first = s.sessions.reduce((m, x) => (x.date < m ? x.date : m), t);
  const ratio = chronic > 0 && first <= addDays(t, -21) ? acute / chronic : undefined;
  const status =
    ratio === undefined ? 'Effort trend unlocks after ~3 weeks of training' : ratio < 0.8 ? 'Lighter than usual' : ratio <= 1.3 ? 'Steady — good zone' : ratio <= 1.5 ? 'Ramping up — watch recovery' : 'Big spike — injury risk rises';
  return { acute, chronic, ratio, status };
}

export const RPE_LABELS: Record<number, string> = {
  1: 'Very easy', 2: 'Easy', 3: 'Moderate', 4: 'Somewhat hard', 5: 'Hard', 6: 'Hard+', 7: 'Very hard', 8: 'Very hard+', 9: 'Near max', 10: 'Max effort',
};

export const hrMax = (maxHr: number | undefined, ageYears: number) => maxHr || 220 - ageYears;
