// Daily readiness + per-exercise progression ("when to add weight, when to go easier").
import type { AppState, Exercise, GutLog } from '../types';
import { allExercises, exerciseHistory, loadRatio } from './training';
import { dailyTargets, isTrainingDay, totalsFor } from './nutrition';
import { totalScore } from './gut';
import { cycleInfo } from './cycle';
import { addDays, today } from './util';

export type ReadinessLevel = 'high' | 'normal' | 'low' | 'very-low';

export interface Readiness {
  score: number;
  level: ReadinessLevel;
  title: string;
  advice: string;
  reasons: { text: string; delta: number }[];
  checkedIn: boolean;
}

export function readiness(s: AppState, date = today()): Readiness {
  const g: GutLog | undefined = (s.gut ?? []).find((x) => x.date === date);
  const reasons: Readiness['reasons'] = [];
  const add = (delta: number, text: string) => { if (delta) reasons.push({ delta, text }); };

  if (g?.sleep !== undefined) add([-20, -10, 0, 5][g.sleep], ['Poor sleep', 'So-so sleep', '', 'Great sleep'][g.sleep]);
  if (g?.energy !== undefined) add([-20, -10, 0, 5][g.energy], ['Low energy', 'Energy a bit low', '', 'High energy'][g.energy]);
  if (g?.soreness !== undefined) add([0, 0, -8, -15][g.soreness], ['', '', 'Quite sore', 'Very sore'][g.soreness]);
  if (g?.mood === 0) add(-5, 'Low mood / stress');
  if (g && totalScore(g) >= 5) add(-10, 'Gut or skin flare-up');

  const lr = loadRatio(s);
  if (lr.ratio && lr.ratio > 1.5) add(-15, 'Training load spiked this week');
  else if (lr.ratio && lr.ratio > 1.3) add(-5, 'Training load ramping up');

  const y = addDays(date, -1);
  if (s.sessions.some((x) => x.date === y && x.rpe >= 8)) add(-5, 'Hard session yesterday');
  const yk = totalsFor(s, y).kcal ?? 0;
  if (yk > 0 && yk < dailyTargets(s.profile, isTrainingDay(s, y)).kcal * 0.7) add(-10, 'Under-ate yesterday (low fuel)');

  const c = cycleInfo(s, date);
  if (c && g?.cycleSymptoms !== undefined && g.cycleSymptoms >= 2) add(g.cycleSymptoms === 3 ? -25 : -12, c.phase === 'menstrual' ? 'Period symptoms' : 'Cycle symptoms (PMS)');
  else if (c && g?.cycleSymptoms === 1) add(-3, 'Mild cycle symptoms');

  const score = Math.max(0, Math.min(100, 70 + reasons.reduce((a, r) => a + r.delta, 0)));
  const level: ReadinessLevel = score >= 75 ? 'high' : score >= 50 ? 'normal' : score >= 30 ? 'low' : 'very-low';
  const copy: Record<ReadinessLevel, [string, string]> = {
    high: ['Ready to push 💪', 'Good day for the planned weight increases and a hard top set.'],
    normal: ['Train as planned', 'Follow the suggested weights. Stop sets with 1–2 reps in reserve.'],
    low: ['Go a bit easier', 'Keep last session’s weights (no increases) and stop around RPE 7 — 3 reps in reserve.'],
    'very-low': ['Take it light today', 'Use ~10–15% lighter weights and fewer sets, or swap for a walk/mobility. Recovery is training too.'],
  };
  return { score, level, title: copy[level][0], advice: copy[level][1], reasons, checkedIn: !!g && (g.sleep !== undefined || g.energy !== undefined) };
}

// ---------------- Progression ----------------

export interface Progression {
  kind: 'first' | 'increase' | 'hold' | 'reps' | 'deload' | 'easy';
  weight: number;
  reps: number;
  text: string;
  why: string;
}

export function increment(ex: Exercise | undefined, weight: number) {
  const eq = ex?.equipment ?? 'Barbell';
  const lower = ex ? ['Legs', 'Glutes'].includes(ex.muscle) || /deadlift/i.test(ex.name) : false;
  if (eq === 'Dumbbell') return 2;
  if (eq === 'Kettlebell') return 4;
  if (eq === 'Cable') return 2.5;
  if (eq === 'Machine') return lower ? 5 : 2.5;
  if (eq === 'Bodyweight') return 2.5; // added weight once reps are high
  const inc = lower ? 5 : 2.5;
  return weight > 0 && weight < 40 ? Math.min(inc, 2.5) : inc;
}

const roundTo = (w: number, step: number) => Math.max(0, Math.round(w / step) * step);

export function progression(s: AppState, exerciseId: string, targetReps?: number, ready?: Readiness): Progression {
  const ex = allExercises(s).find((e) => e.id === exerciseId);
  const hist = exerciseHistory(s, exerciseId).filter((h) => h.sets.length);
  const last = hist.at(-1);
  if (!last) return { kind: 'first', weight: 0, reps: targetReps ?? 8, text: 'First time: find your weight', why: 'Pick a weight you could lift for about 2 more reps (RPE 8). The app learns from there.' };

  const top = last.topWeight;
  const topSets = last.sets.filter((x) => x.weight >= top * 0.98);
  const repsCounts = last.sets.map((x) => x.reps);
  const target = targetReps ?? repsCounts.sort((a, b) => repsCounts.filter((v) => v === b).length - repsCounts.filter((v) => v === a).length)[0];
  const session = s.sessions.find((x) => x.id === last.sessionId);
  const setRpes = topSets.map((x) => x.rpe).filter((r): r is number => r !== undefined);
  const effort = setRpes.length ? setRpes.reduce((a, b) => a + b, 0) / setRpes.length : session?.rpe ?? 7;
  const effortSrc = setRpes.length ? 'set RPE' : 'session effort';
  const hitAll = topSets.every((x) => x.reps >= target);
  const missed = topSets.some((x) => x.reps <= target - 2) || topSets.reduce((a, x) => a + x.reps, 0) / topSets.length < target - 0.5;
  const prev = hist.at(-2);
  const prevMissedSame = !!prev && prev.topWeight === top && prev.sets.filter((x) => x.weight >= top * 0.98).some((x) => x.reps < target);
  const stalled = hist.length >= 4 && Math.max(...hist.slice(-3).map((h) => h.e1rm)) <= hist.at(-4)!.e1rm;
  const inc = increment(ex, top);
  const bodyweight = top === 0;
  const lastStr = `Last time: ${topSets.map((x) => `${bodyweight ? 'BW' : x.weight}×${x.reps}`).join(', ')} at ${effortSrc} ${effort.toFixed(1).replace('.0', '')}.`;

  let p: Progression;
  if (missed && (prevMissedSame || stalled)) {
    const w = roundTo(top * 0.9, inc);
    p = { kind: 'deload', weight: w, reps: target, text: bodyweight ? `Deload: ${Math.max(1, target - 2)} reps per set` : `Deload to ${w} kg × ${target}`, why: `${lastStr} Missed reps two sessions in a row — drop ~10% and build back up. This usually breaks a plateau.` };
  } else if (missed) {
    p = { kind: 'hold', weight: top, reps: target, text: `Repeat ${bodyweight ? 'bodyweight' : `${top} kg`} × ${target}`, why: `${lastStr} Didn’t hit ${target} reps on every set — repeat the weight and aim to get them all.` };
  } else if (hitAll && effort <= 8) {
    if (bodyweight) p = { kind: 'reps', weight: 0, reps: target + 1, text: `Go for ${target + 1} reps per set`, why: `${lastStr} All sets done with reps to spare — add a rep. Past ~12–15 reps, add weight (belt/vest/dumbbell).` };
    else p = { kind: 'increase', weight: top + inc, reps: target, text: `Increase to ${top + inc} kg × ${target}`, why: `${lastStr} All sets hit ${target} with reps to spare — time to add ${inc} kg.` };
  } else if (hitAll) {
    p = { kind: 'reps', weight: top, reps: target, text: `Repeat ${bodyweight ? 'bodyweight' : `${top} kg`} × ${target}`, why: `${lastStr} You hit your reps, but it was close to max effort. Repeat it; when it feels like RPE 8 or easier, go up.` };
  } else {
    p = { kind: 'hold', weight: top, reps: target, text: `Repeat ${bodyweight ? 'bodyweight' : `${top} kg`} × ${target}`, why: lastStr };
  }

  // Body-state adjustment.
  if (ready && (ready.level === 'low' || ready.level === 'very-low') && p.kind !== 'deload') {
    if (ready.level === 'very-low' && !bodyweight) {
      const w = roundTo(top * 0.85, inc);
      return { kind: 'easy', weight: w, reps: target, text: `Light day: ${w} kg × ${target}`, why: `Readiness is ${ready.score}/100 (${ready.reasons.filter((r) => r.delta < 0).map((r) => r.text.toLowerCase()).join(', ')}). ${p.kind === 'increase' ? `Save the increase to ${p.weight} kg for a better day.` : ''}` };
    }
    if (p.kind === 'increase' || p.kind === 'reps') {
      return { kind: 'easy', weight: top, reps: target, text: `Hold at ${bodyweight ? 'bodyweight' : `${top} kg`} × ${target} today`, why: `You’re due an increase, but readiness is ${ready.score}/100 (${ready.reasons.filter((r) => r.delta < 0).map((r) => r.text.toLowerCase()).join(', ')}). Keep the weight, stop around RPE 7, and go up next time.` };
    }
  }
  return p;
}
