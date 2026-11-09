// Badges, forgiving streaks, strength levels, perfect days and the weekly recap.
import type { AppState } from '../types';
import { dailyTargets, entriesFor, isTrainingDay, sum, totalsFor } from './nutrition';
import { allExercises, e1rm, exerciseHistory, sessionVolume, weeklySummaries, workingSets } from './training';
import { foodCategory, weightTrend } from './coach';
import { addDays, parseDate, today, weekStart } from './util';

// ---------------- Streak (forgiving) ----------------

export const FREEZES_PER_MONTH = 2;
const logged = (s: AppState, d: string) => s.entries.some((e) => e.date === d);

export type DayState = 'log' | 'freeze' | 'miss' | 'future' | 'pending';

/** Consecutive days with food logged. A single missed day is bridged by a "freeze" (2 per month). */
export function loggingStreak(s: AppState) {
  const t = today();
  const freezes = new Set<string>();
  const used: Record<string, number> = {};
  let d = logged(s, t) ? t : addDays(t, -1); // today not logged yet doesn't break anything
  let count = 0;
  for (let i = 0; i < 2000; i++) {
    if (logged(s, d)) { count++; d = addDays(d, -1); continue; }
    const m = d.slice(0, 7);
    if (count > 0 && (used[m] ?? 0) < FREEZES_PER_MONTH && logged(s, addDays(d, -1))) { used[m] = (used[m] ?? 0) + 1; freezes.add(d); d = addDays(d, -1); continue; }
    break;
  }
  const ws = weekStart(t);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(ws, i);
    const state: DayState = day > t ? 'future' : logged(s, day) ? 'log' : freezes.has(day) ? 'freeze' : day === t ? 'pending' : 'miss';
    return { date: day, state, today: day === t };
  });
  return { count, freezesLeft: FREEZES_PER_MONTH - (used[t.slice(0, 7)] ?? 0), week };
}

// ---------------- Perfect day ----------------

/** Calories within ±10% of target, protein ≥ 90%, water goal reached and a daily check-in. */
export function perfectDay(s: AppState, d = today()) {
  const n = totalsFor(s, d);
  const t = dailyTargets(s.profile, isTrainingDay(s, d));
  const kcal = n.kcal ?? 0;
  const parts = {
    calories: Math.min(1, kcal / (t.kcal * 0.9)),
    caloriesInZone: kcal >= t.kcal * 0.9 && kcal <= t.kcal * 1.1,
    protein: Math.min(1, (n.protein ?? 0) / (t.protein * 0.9)),
    water: Math.min(1, (s.water[d] ?? 0) / s.profile.waterGoalMl),
    checkIn: (s.gut ?? []).some((g) => g.date === d && (g.sleep !== undefined || !g.wellnessOnly)),
  };
  const perfect = parts.caloriesInZone && parts.protein >= 1 && parts.water >= 1 && parts.checkIn;
  return { ...parts, perfect, over: kcal > t.kcal * 1.1 };
}

// ---------------- Strength levels ----------------

// Approximate 1RM standards as multiples of body weight (beginner, novice, intermediate, advanced, elite).
const STANDARDS: Record<string, { male: number[]; female: number[] }> = {
  'Bench Press': { male: [0.5, 0.75, 1.0, 1.5, 2.0], female: [0.25, 0.5, 0.75, 1.0, 1.5] },
  'Back Squat': { male: [0.75, 1.25, 1.5, 2.25, 2.75], female: [0.5, 0.75, 1.25, 1.5, 2.0] },
  'Deadlift': { male: [1.0, 1.5, 2.0, 2.5, 3.0], female: [0.5, 1.0, 1.25, 1.75, 2.5] },
  'Overhead Press': { male: [0.35, 0.55, 0.75, 1.0, 1.25], female: [0.2, 0.35, 0.5, 0.75, 1.0] },
};
export const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

export function strengthLevels(s: AppState) {
  const bw = s.profile.weightKg;
  return allExercises(s)
    .filter((e) => STANDARDS[e.name])
    .map((e) => {
      const h = exerciseHistory(s, e.id);
      if (!h.length) return undefined;
      const best = Math.max(...h.map((x) => x.e1rm));
      const ratio = best / bw;
      const std = STANDARDS[e.name][s.profile.sex];
      let level = -1;
      std.forEach((v, i) => { if (ratio >= v) level = i; });
      // Marker position: each level owns 25% of the bar between its threshold and the next.
      let pos: number;
      if (ratio <= std[0]) pos = (ratio / std[0]) * 0;
      else if (ratio >= std[4]) pos = 100;
      else { const i = std.findIndex((v, k) => ratio >= v && ratio < std[k + 1]); pos = (i + (ratio - std[i]) / (std[i + 1] - std[i])) * 25; }
      const next = level < 4 ? std[level + 1] * bw : undefined;
      return { id: e.id, name: e.name, best, ratio, level: Math.max(0, level), label: level < 0 ? 'Getting started' : LEVELS[level], pos: Math.max(2, pos), nextLabel: level < 4 ? LEVELS[level + 1] : undefined, nextKg: next ? Math.ceil(next / 2.5) * 2.5 : undefined };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

// ---------------- Badges ----------------

export interface Badge { id: string; name: string; desc: string; icon: string; progress: number; label: string; hidden?: boolean }

export function badges(s: AppState): Badge[] {
  const n = s.sessions.length;
  const streak = loggingStreak(s).count;
  const topSet = Math.max(0, ...s.sessions.flatMap((x) => x.exercises.flatMap((e) => workingSets(e.sets).map((z) => z.weight))));
  const longestRun = Math.max(0, ...s.sessions.flatMap((x) => x.cardio.filter((c) => c.activity === 'run').map((c) => c.distanceKm ?? 0)));
  const early = s.sessions.filter((x) => new Date(x.startedAt).getHours() < 8).length;
  const perfect = s.celebrated?.perfectDays ?? [];
  const perfectWeek = Math.max(0, ...[0, 1, 2, 3].map((w) => { const ws = addDays(weekStart(today()), -7 * w); return perfect.filter((d) => d >= ws && d < addDays(ws, 7)).length; }));
  let prCount = 0;
  for (const ex of new Set(s.sessions.flatMap((x) => x.exercises.map((e) => e.exerciseId)))) {
    let best = 0;
    for (const h of exerciseHistory(s, ex)) { if (best > 0 && h.e1rm > best) prCount++; best = Math.max(best, h.e1rm); }
  }
  const proteinDays = new Set(s.entries.map((e) => e.date)).size
    ? [...new Set(s.entries.map((e) => e.date))].filter((d) => (sum(entriesFor(s, d).map((e) => e.nutrients)).protein ?? 0) >= dailyTargets(s.profile, false).protein * 0.9).length : 0;
  const waterDays = Object.values(s.water).filter((ml) => ml >= s.profile.waterGoalMl).length;
  const plants = new Set(s.entries.filter((e) => e.date > addDays(today(), -7)).filter((e) => ['fruit', 'veg', 'legume', 'nuts', 'starch'].includes(foodCategory(s, e))).map((e) => e.foodId)).size;
  const B = (id: string, name: string, desc: string, icon: string, value: number, goal: number, unit = '', hidden = false): Badge =>
    ({ id, name, desc, icon, progress: Math.min(1, value / goal), label: `${Math.min(value, goal) % 1 ? Math.min(value, goal).toFixed(1) : Math.min(value, goal)} / ${goal}${unit}`, hidden });
  const list: Badge[] = [
    B('first-workout', 'First workout', 'Finish your first workout', 'dumbbell', n, 1),
    B('workouts-10', '10 workouts', 'Finish 10 workouts', 'dumbbell', n, 10),
    B('workouts-50', '50 workouts', 'Finish 50 workouts', 'medal', n, 50),
    B('streak-7', '7 days logged', 'Log food 7 days in a row', 'utensils', streak, 7),
    B('streak-30', '30-day streak', 'Log food 30 days in a row', 'flame', streak, 30),
    B('pr-10', 'PR hunter', 'Set 10 personal records', 'trophy', prCount, 10),
    B('club-100', '100 kg club', 'Lift 100 kg in any working set', 'weight', topSet, 100, ' kg'),
    B('perfect-day', 'Perfect day', 'Close all rings in one day', 'star', perfect.length, 1),
    B('perfect-week', 'Perfect week', '5 perfect days in one week', 'sparkles', perfectWeek, 5),
    B('protein-10', 'Protein pro', 'Hit your protein target on 10 days', 'beef', proteinDays, 10),
    B('water-7', 'Hydrated', 'Reach your water goal on 7 days', 'droplet', waterDays, 7),
    B('plants-30', '30 plants', '30 different plant foods in a week', 'leaf', plants, 30),
    B('run-5k', '5K runner', 'Run 5 km in one go', 'footprints', longestRun, 5, ' km'),
    B('early-bird', 'Early bird', '10 workouts started before 8:00', 'sunrise', early, 10),
  ];
  if (s.protocol) list.push(B('reset-1', 'Phase 1 done', 'Finish the elimination phase of your gut reset', 'shield', s.protocol.phase >= 2 ? 1 : 0, 1));
  return list;
}

/** Badges newly completed (not yet recorded). On the very first run, records silently. */
export function newlyEarned(s: AppState) {
  const done = badges(s).filter((b) => b.progress >= 1);
  const rec = s.celebrated?.badges;
  return { all: done, fresh: rec ? done.filter((b) => !rec[b.id]) : [], firstRun: !rec };
}

// ---------------- Weekly recap ----------------

export function weeklyRecap(s: AppState, weekStartDate = addDays(weekStart(today()), -7)) {
  const end = addDays(weekStartDate, 7);
  const sessions = s.sessions.filter((x) => x.date >= weekStartDate && x.date < end);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  const prs: string[] = [];
  for (const x of sessions) for (const e of x.exercises) {
    const h = exerciseHistory(s, e.exerciseId);
    const idx = h.findIndex((z) => z.sessionId === x.id);
    if (idx > 0 && h[idx].e1rm > Math.max(...h.slice(0, idx).map((z) => z.e1rm))) prs.push(e.exerciseId);
  }
  let bestLift: { name: string; text: string; e: number } | undefined;
  for (const x of sessions) for (const e of x.exercises) for (const z of workingSets(e.sets)) {
    const v = e1rm(z.weight, z.reps);
    if (!bestLift || v > bestLift.e) bestLift = { name: allExercises(s).find((q) => q.id === e.exerciseId)?.name ?? '', text: `${z.weight} kg × ${z.reps}`, e: v };
  }
  const w = weeklySummaries(s, 2)[0];
  const trend = weightTrend(s, 28);
  return {
    weekStart: weekStartDate,
    label: `${parseDate(weekStartDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}–${parseDate(addDays(weekStartDate, 6)).toLocaleDateString(undefined, { day: 'numeric' })}`,
    workouts: sessions.length,
    tonnes: sessions.reduce((a, x) => a + sessionVolume(x), 0) / 1000,
    prs: new Set(prs).size,
    avgRpe: sessions.length ? sessions.reduce((a, x) => a + x.rpe, 0) / sessions.length : 0,
    daysLogged: days.filter((d) => logged(s, d)).length,
    trend: trend?.kgPerWeek,
    bestLift,
    hasData: sessions.length > 0 || days.some((d) => logged(s, d)) || w.sessions > 0,
  };
}
