// Program builder: turns goals, schedule, equipment and muscle priorities into a weekly program.
//
// Principles (mainstream resistance-training evidence):
//  - Weekly hard sets per muscle drive growth; ~10–20 sets/week is a common productive range
//    (dose–response: Schoenfeld et al. 2017). Maintenance needs far less (~1/3 or lower; Bickel et al. 2011).
//  - Training each muscle ~2×/week is at least as good as 1× (Schoenfeld et al. 2016), so volume is spread.
//  - ~6–8 hard sets per muscle per session before returns drop sharply, so per-session volume is capped.
//  - Priority principle: focus muscles go first while you are fresh.
//  - Rep ranges from ~5 to ~30 build muscle when sets are close to failure; heavier work (3–6) builds max strength.
import type { Template } from '../types';
import { BUILTIN_EXERCISES } from './exercises';

export type Muscle = 'glutes' | 'quads' | 'hamstrings' | 'calves' | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'core';
export type Priority = 'light' | 'normal' | 'focus';
export type Goal = 'muscle' | 'strength' | 'general' | 'toning';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Equip = 'gym' | 'home' | 'bodyweight';
export type Avoid = 'lowerback' | 'knees' | 'shoulders';

export const MUSCLES: { key: Muscle; label: string }[] = [
  { key: 'glutes', label: 'Glutes' }, { key: 'quads', label: 'Quads' }, { key: 'hamstrings', label: 'Hamstrings' }, { key: 'calves', label: 'Calves' },
  { key: 'chest', label: 'Chest' }, { key: 'back', label: 'Back' }, { key: 'shoulders', label: 'Shoulders' },
  { key: 'biceps', label: 'Biceps' }, { key: 'triceps', label: 'Triceps' }, { key: 'core', label: 'Core' },
];

export interface ProgramInputs {
  goal: Goal;
  days: number; // 2–6
  minutes: number; // per session
  level: Level;
  equipment: Equip;
  pullupBar: boolean;
  avoid: Avoid[];
  priorities: Record<Muscle, Priority>;
  seed: number;
}

type Eq = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'band' | 'kettlebell' | 'bar';
interface Ex { name: string; m: Muscle; eq: Eq; compound: boolean; avoid?: Avoid[]; big?: boolean; glutePump?: boolean }

// Candidate exercises per muscle, in rough order of preference.
const CATALOG: Ex[] = [
  // Glutes
  { name: 'Hip Thrust', m: 'glutes', eq: 'barbell', compound: true, big: true },
  { name: 'Bulgarian Split Squat', m: 'glutes', eq: 'dumbbell', compound: true, avoid: ['knees'] },
  { name: 'Sumo Deadlift', m: 'glutes', eq: 'barbell', compound: true, avoid: ['lowerback'] },
  { name: 'Cable Pull-Through', m: 'glutes', eq: 'cable', compound: true },
  { name: '45° Back Extension', m: 'glutes', eq: 'machine', compound: true, avoid: ['lowerback'] },
  { name: 'Single-Leg Hip Thrust', m: 'glutes', eq: 'bodyweight', compound: true },
  { name: 'Glute Bridge', m: 'glutes', eq: 'bodyweight', compound: true },
  { name: 'Hip Abduction Machine', m: 'glutes', eq: 'machine', compound: false, glutePump: true },
  { name: 'Cable Kickback', m: 'glutes', eq: 'cable', compound: false, glutePump: true },
  { name: 'Banded Lateral Walk', m: 'glutes', eq: 'band', compound: false, glutePump: true },
  // Quads
  { name: 'Back Squat', m: 'quads', eq: 'barbell', compound: true, big: true, avoid: ['knees', 'lowerback'] },
  { name: 'Leg Press', m: 'quads', eq: 'machine', compound: true, avoid: ['knees'] },
  { name: 'Goblet Squat', m: 'quads', eq: 'dumbbell', compound: true },
  { name: 'Front Squat', m: 'quads', eq: 'barbell', compound: true, avoid: ['knees'] },
  { name: 'Step-Up', m: 'quads', eq: 'dumbbell', compound: true },
  { name: 'Reverse Lunge', m: 'quads', eq: 'dumbbell', compound: true },
  { name: 'Split Squat', m: 'quads', eq: 'bodyweight', compound: true, avoid: ['knees'] },
  { name: 'Bodyweight Squat', m: 'quads', eq: 'bodyweight', compound: true },
  { name: 'Leg Extension', m: 'quads', eq: 'machine', compound: false, avoid: ['knees'] },
  // Hamstrings
  { name: 'Romanian Deadlift', m: 'hamstrings', eq: 'barbell', compound: true, big: true, avoid: ['lowerback'] },
  { name: 'Dumbbell Romanian Deadlift', m: 'hamstrings', eq: 'dumbbell', compound: true, avoid: ['lowerback'] },
  { name: 'Leg Curl', m: 'hamstrings', eq: 'machine', compound: false },
  { name: 'Single-Leg Romanian Deadlift', m: 'hamstrings', eq: 'dumbbell', compound: true },
  { name: 'Sliding Leg Curl', m: 'hamstrings', eq: 'bodyweight', compound: false },
  { name: 'Deadlift', m: 'hamstrings', eq: 'barbell', compound: true, big: true, avoid: ['lowerback'] },
  // Calves
  { name: 'Calf Raise', m: 'calves', eq: 'bodyweight', compound: false },
  // Chest
  { name: 'Bench Press', m: 'chest', eq: 'barbell', compound: true, big: true, avoid: ['shoulders'] },
  { name: 'Dumbbell Bench Press', m: 'chest', eq: 'dumbbell', compound: true },
  { name: 'Incline Dumbbell Press', m: 'chest', eq: 'dumbbell', compound: true },
  { name: 'Machine Chest Press', m: 'chest', eq: 'machine', compound: true },
  { name: 'Push-Up', m: 'chest', eq: 'bodyweight', compound: true },
  { name: 'Cable Fly', m: 'chest', eq: 'cable', compound: false, avoid: ['shoulders'] },
  // Back
  { name: 'Lat Pulldown', m: 'back', eq: 'cable', compound: true },
  { name: 'Pull-Up', m: 'back', eq: 'bar', compound: true },
  { name: 'Barbell Row', m: 'back', eq: 'barbell', compound: true, big: true, avoid: ['lowerback'] },
  { name: 'Seated Cable Row', m: 'back', eq: 'cable', compound: true },
  { name: 'Dumbbell Row', m: 'back', eq: 'dumbbell', compound: true },
  { name: 'Chin-Up', m: 'back', eq: 'bar', compound: true },
  { name: 'Inverted Row', m: 'back', eq: 'bodyweight', compound: true },
  { name: 'Band Row', m: 'back', eq: 'band', compound: true },
  // Shoulders
  { name: 'Overhead Press', m: 'shoulders', eq: 'barbell', compound: true, big: true, avoid: ['shoulders', 'lowerback'] },
  { name: 'Dumbbell Shoulder Press', m: 'shoulders', eq: 'dumbbell', compound: true, avoid: ['shoulders'] },
  { name: 'Lateral Raise', m: 'shoulders', eq: 'dumbbell', compound: false },
  { name: 'Face Pull', m: 'shoulders', eq: 'cable', compound: false },
  { name: 'Rear Delt Fly', m: 'shoulders', eq: 'dumbbell', compound: false },
  { name: 'Pike Push-Up', m: 'shoulders', eq: 'bodyweight', compound: true, avoid: ['shoulders'] },
  { name: 'Band Pull-Apart', m: 'shoulders', eq: 'band', compound: false },
  // Arms
  { name: 'Dumbbell Curl', m: 'biceps', eq: 'dumbbell', compound: false },
  { name: 'Barbell Curl', m: 'biceps', eq: 'barbell', compound: false },
  { name: 'Hammer Curl', m: 'biceps', eq: 'dumbbell', compound: false },
  { name: 'Band Curl', m: 'biceps', eq: 'band', compound: false },
  { name: 'Triceps Pushdown', m: 'triceps', eq: 'cable', compound: false },
  { name: 'Overhead Triceps Extension', m: 'triceps', eq: 'cable', compound: false, avoid: ['shoulders'] },
  { name: 'Dumbbell Overhead Triceps Extension', m: 'triceps', eq: 'dumbbell', compound: false, avoid: ['shoulders'] },
  { name: 'Skull Crusher', m: 'triceps', eq: 'barbell', compound: false },
  { name: 'Diamond Push-Up', m: 'triceps', eq: 'bodyweight', compound: true },
  // Core
  { name: 'Cable Crunch', m: 'core', eq: 'cable', compound: false },
  { name: 'Hanging Leg Raise', m: 'core', eq: 'bar', compound: false, avoid: ['lowerback'] },
  { name: 'Dead Bug', m: 'core', eq: 'bodyweight', compound: false },
  { name: 'Plank (reps = seconds)', m: 'core', eq: 'bodyweight', compound: false },
  { name: 'Ab Wheel Rollout', m: 'core', eq: 'bodyweight', compound: false, avoid: ['lowerback'] },
];

const EQUIP: Record<Equip, Eq[]> = {
  gym: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'kettlebell', 'bar'],
  home: ['dumbbell', 'bodyweight', 'band', 'kettlebell'],
  bodyweight: ['bodyweight', 'band'],
};

// Weekly hard sets per muscle by priority and experience.
const VOLUME: Record<Priority, Record<Level, number>> = {
  focus: { beginner: 10, intermediate: 14, advanced: 18 },
  normal: { beginner: 8, intermediate: 10, advanced: 12 },
  light: { beginner: 4, intermediate: 5, advanced: 6 },
};
const SMALL: Muscle[] = ['calves', 'biceps', 'triceps', 'core']; // get a bit less when not a focus

type DayKind = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs';
const DAY_MUSCLES: Record<DayKind, Muscle[]> = {
  full: ['glutes', 'quads', 'hamstrings', 'calves', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'core'],
  upper: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'core'],
  lower: ['glutes', 'quads', 'hamstrings', 'calves', 'core'],
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'shoulders', 'biceps', 'core'],
  legs: ['glutes', 'quads', 'hamstrings', 'calves', 'core'],
};
const DAY_LABEL: Record<DayKind, string> = { full: 'Full body', upper: 'Upper', lower: 'Lower', push: 'Push', pull: 'Pull', legs: 'Legs' };

function split(days: number, pr: Record<Muscle, Priority>): DayKind[] {
  const lowerFocus = (['glutes', 'quads', 'hamstrings'] as Muscle[]).some((m) => pr[m] === 'focus');
  if (days <= 3) return Array(days).fill('full');
  if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (days === 5) return lowerFocus ? ['lower', 'upper', 'lower', 'upper', 'lower'] : ['upper', 'lower', 'push', 'pull', 'legs'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
}

export const SCHEDULE: Record<number, string[]> = {
  2: ['Mon', 'Thu'], 3: ['Mon', 'Wed', 'Fri'], 4: ['Mon', 'Tue', 'Thu', 'Fri'], 5: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'], 6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

export interface ProgramExercise { exerciseId: string; name: string; muscle: Muscle; sets: number; reps: number; repRange: [number, number]; restSec: number; compound: boolean; superset?: string }
export interface ProgramDay { name: string; kind: DayKind; weekday: string; exercises: ProgramExercise[]; minutes: number }
export interface Program { name: string; summary: string; days: ProgramDay[]; weekly: Record<Muscle, number>; targets: Record<Muscle, number>; notes: string[] }

function reps(goal: Goal, ex: Ex, level: Level): [number, number] {
  if (ex.name.startsWith('Plank')) return [30, 60];
  if (goal === 'strength') return ex.big ? (level === 'beginner' ? [5, 8] : [3, 6]) : ex.compound ? [6, 10] : [10, 15];
  if (goal === 'muscle') return ex.compound ? [6, 12] : ex.glutePump ? [15, 25] : [10, 15];
  if (goal === 'toning') return ex.compound ? [10, 15] : [12, 20];
  return ex.compound ? [8, 12] : [12, 15];
}
function rest(goal: Goal, ex: Ex, short: boolean) {
  const base = goal === 'strength' ? (ex.big ? 180 : ex.compound ? 120 : 75) : goal === 'muscle' ? (ex.compound ? 120 : 75) : ex.compound ? 90 : 60;
  return short ? Math.round((base * 0.75) / 15) * 15 : base;
}

const exId = (name: string) => BUILTIN_EXERCISES.find((e) => e.name === name)?.id;

export function buildProgram(inp: ProgramInputs): Program {
  const allowed = new Set(EQUIP[inp.equipment]);
  if (inp.equipment !== 'gym' && inp.pullupBar) allowed.add('bar');
  const usable = CATALOG.filter((e) => allowed.has(e.eq) && !(e.avoid ?? []).some((a) => inp.avoid.includes(a)) && exId(e.name));
  const kinds = split(inp.days, inp.priorities);
  const short = inp.minutes <= 45;
  const perSetMin = inp.goal === 'strength' ? 3.4 : short ? 2.2 : 2.6;
  const budget = Math.max(6, Math.floor((inp.minutes - 8) / perSetMin)); // sets per session

  // 1. Weekly targets, scaled to fit the available time.
  const targets = {} as Record<Muscle, number>;
  for (const { key } of MUSCLES) {
    const p = inp.priorities[key];
    let v = VOLUME[p][inp.level];
    if (SMALL.includes(key) && p !== 'focus') v = Math.max(p === 'light' ? 3 : 4, Math.round(v * 0.6));
    targets[key] = usable.some((e) => e.m === key) ? v : 0;
  }
  const capacity = budget * inp.days;
  let total = Object.values(targets).reduce((a, b) => a + b, 0);
  if (total > capacity) {
    // Trim in this order: small muscles that big lifts already work (arms, calves, core), then light,
    // then normal muscles, and focus muscles last (never below 8 sets).
    const steps: { tier: Priority; small: boolean; floor: number }[] = [
      { tier: 'light', small: true, floor: 2 }, { tier: 'normal', small: true, floor: 2 }, { tier: 'light', small: false, floor: 3 },
      { tier: 'normal', small: false, floor: 4 }, { tier: 'focus', small: true, floor: 4 }, { tier: 'focus', small: false, floor: 8 },
    ];
    for (const st of steps) {
      let guard = 300;
      while (total > capacity && guard-- > 0) {
        const cand = MUSCLES.map((m) => m.key).filter((k) => inp.priorities[k] === st.tier && SMALL.includes(k) === st.small && targets[k] > st.floor).sort((a, b) => targets[b] - targets[a])[0];
        if (!cand) break;
        targets[cand]--; total--;
      }
    }
  }

  // 2. Spread each muscle's sets over the days that can train it (~2×/week, max per session).
  const plan: Record<Muscle, number>[] = kinds.map(() => ({} as Record<Muscle, number>));
  const load = kinds.map(() => 0);
  const order = MUSCLES.map((m) => m.key).sort((a, b) => ({ focus: 0, normal: 1, light: 2 }[inp.priorities[a]] - { focus: 0, normal: 1, light: 2 }[inp.priorities[b]]));
  for (const m of order) {
    const sets = targets[m];
    if (!sets) continue;
    const eligible = kinds.map((k, i) => (DAY_MUSCLES[k].includes(m) ? i : -1)).filter((i) => i >= 0);
    if (!eligible.length) continue;
    const cap = inp.priorities[m] === 'focus' ? 8 : 6;
    // Focus muscles get every eligible day (up to 3); others ~2×/week when there is enough volume.
    const occ = Math.min(eligible.length, Math.max(inp.priorities[m] === 'focus' ? 3 : sets >= 4 ? 2 : 1, Math.ceil(sets / cap)));
    // Prefer spaced-out days with the least load.
    const chosen = [...eligible].sort((a, b) => load[a] - load[b] || a - b).slice(0, occ).sort((a, b) => a - b);
    let left = Math.min(sets, cap * chosen.length);
    chosen.forEach((d, i) => {
      const n = Math.ceil(left / (chosen.length - i));
      plan[d][m] = n; load[d] += n; left -= n;
    });
  }

  // 3. Pick exercises: compounds first, rotate choices between days, no duplicates within a day.
  const rot = (arr: Ex[], k: number) => arr.length ? [...arr.slice(k % arr.length), ...arr.slice(0, k % arr.length)] : arr;
  const seen: Partial<Record<Muscle, number>> = {}; // how many times each muscle has been placed so far
  const days: ProgramDay[] = kinds.map((kind, di) => {
    const used = new Set<string>();
    const items: ProgramExercise[] = [];
    const muscles = Object.keys(plan[di]) as Muscle[];
    muscles.sort((a, b) => ({ focus: 0, normal: 1, light: 2 }[inp.priorities[a]] - { focus: 0, normal: 1, light: 2 }[inp.priorities[b]]) || (SMALL.includes(a) ? 1 : 0) - (SMALL.includes(b) ? 1 : 0));
    for (const m of muscles) {
      const n = plan[di][m];
      let pool = usable.filter((e) => e.m === m && !used.has(e.name));
      // In a gym, home/bodyweight moves are fallbacks only (pull-ups excluded — they're a staple).
      if (inp.equipment === 'gym') { const gymOnly = pool.filter((e) => e.eq !== 'bodyweight' && e.eq !== 'band'); if (gymOnly.length >= 2) pool = gymOnly; }
      // The first time a muscle appears in the week it gets the preferred (usually big) lift; later days rotate.
      const k = (seen[m] ?? 0) + inp.seed; seen[m] = (seen[m] ?? 0) + 1;
      const comps = rot(pool.filter((e) => e.compound), k);
      const isos = rot(pool.filter((e) => !e.compound), k);
      // Small muscles and rear/side delts on pull days are best trained with isolation work.
      const isoFirst = SMALL.includes(m) || (m === 'shoulders' && kind === 'pull');
      const first = isoFirst ? (isos[0] ?? comps[0]) : (comps[0] ?? isos[0]);
      if (!first) continue;
      const picks: Ex[] = [first];
      if (n >= 5) { const second = isoFirst ? (isos[1] ?? comps[0]) : (isos[0] ?? comps[1]); if (second && second !== first) picks.push(second); }
      const per = picks.length === 1 ? [Math.min(n, 5)] : [Math.ceil(n / 2), Math.floor(n / 2)];
      picks.forEach((ex, i) => {
        used.add(ex.name);
        const rr = reps(inp.goal, ex, inp.level);
        items.push({ exerciseId: exId(ex.name)!, name: ex.name, muscle: m, sets: per[i], reps: Math.round((rr[0] + rr[1]) / 2), repRange: rr, restSec: rest(inp.goal, ex, short), compound: ex.compound });
      });
    }
    // Order: compounds of focus muscles first, isolation and small muscles last.
    const pri = (x: ProgramExercise) => ({ focus: 0, normal: 1, light: 2 }[inp.priorities[x.muscle]]) * 2 + (x.compound ? 0 : 1) + (SMALL.includes(x.muscle) ? 4 : 0);
    items.sort((a, b) => pri(a) - pri(b));
    // Short sessions: pair non-competing exercises as supersets to save time.
    if (short) {
      let letter = 0;
      const upper = (m: Muscle) => ['chest', 'back', 'shoulders', 'biceps', 'triceps'].includes(m);
      for (let i = 0; i < items.length - 1; i++) {
        const a = items[i], b = items[i + 1];
        if (a.superset || b.superset) continue;
        // Pair exercises that don't compete: upper with lower body, or opposing muscles.
        const opposing = (x: Muscle, y: Muscle) => [x, y].sort().join() === 'back,chest' || [x, y].sort().join() === 'biceps,triceps';
        if (upper(a.muscle) !== upper(b.muscle) || opposing(a.muscle, b.muscle)) {
          const tag = String.fromCharCode(65 + letter++);
          a.superset = tag; b.superset = tag; i++;
        }
      }
    }
    const sets = items.reduce((a, x) => a + x.sets, 0);
    const restTotal = items.reduce((a, x) => a + x.sets * (x.restSec / 60) * (x.superset ? 0.6 : 1), 0);
    return { name: '', kind, weekday: SCHEDULE[inp.days][di], exercises: items, minutes: Math.round(8 + sets * 0.75 + restTotal) };
  });
  const letters = 'ABCDEF';
  days.forEach((d, i) => {
    const focusHere = d.exercises.filter((x) => inp.priorities[x.muscle] === 'focus').map((x) => MUSCLES.find((m) => m.key === x.muscle)!.label);
    const tag = [...new Set(focusHere)].slice(0, 2).join(' & ');
    d.name = `Day ${letters[i]} · ${DAY_LABEL[d.kind]}${tag ? ` (${tag.toLowerCase()} focus)` : ''}`;
  });

  const weekly = {} as Record<Muscle, number>;
  for (const { key } of MUSCLES) weekly[key] = days.reduce((a, d) => a + d.exercises.filter((x) => x.muscle === key).reduce((b, x) => b + x.sets, 0), 0);

  // 4. Plain-language explanation.
  const focus = MUSCLES.filter((m) => inp.priorities[m.key] === 'focus').map((m) => m.label.toLowerCase());
  const light = MUSCLES.filter((m) => inp.priorities[m.key] === 'light').map((m) => m.label.toLowerCase());
  const splitName = kinds[0] === 'full' ? `full-body sessions` : inp.days === 4 ? 'an upper/lower split' : kinds.includes('push') && kinds.includes('legs') && inp.days === 6 ? 'push/pull/legs twice a week' : 'an upper/lower + push/pull/legs mix';
  const notes: string[] = [
    `${inp.days} days a week (${SCHEDULE[inp.days].join(', ')}) using ${splitName}, so most muscles are trained about twice a week. Research shows 2× a week works at least as well as once.`,
    focus.length ? `Focus on ${focus.join(', ')}: ${focus.map((f) => `${weekly[MUSCLES.find((m) => m.label.toLowerCase() === f)!.key]} sets`).join(', ')} a week, placed first in each session while you're fresh. Roughly 10–20 weekly sets is the productive range for growth.` : 'Balanced volume across all muscles, within the ~10–20 weekly sets range that research links to good growth.',
    light.length ? `Light on ${light.join(', ')}: about 3–6 sets a week, enough to keep (and slowly build) strength without eating into recovery.` : '',
    inp.goal === 'strength' ? 'Main lifts use heavy sets of 3–6 reps with longer rest (about 3 min); accessories use moderate reps.' : inp.goal === 'toning' ? 'Moderate weights for 10–20 reps, short rests. "Toning" is building some muscle while keeping body fat in check, so pair this with your calorie target.' : 'Most sets in the 6–15 rep range. Any range from ~5 to 30 reps builds muscle when you finish close to failure.',
    'Effort: stop most sets with 1–3 reps left in the tank (RPE 7–9). The last set of an isolation exercise can go to failure.',
    'Progression: when you hit the top of the rep range on every set, add weight. The workout screen suggests this automatically.',
    short ? `Sessions are about ${inp.minutes} min, so exercises marked A, B… are done as supersets (alternate between them and rest once) to save time.` : '',
    inp.avoid.length ? `Exercises that load your ${inp.avoid.map((a) => (a === 'lowerback' ? 'lower back' : a)).join(' and ')} were swapped for friendlier options. Stop any exercise that causes pain and get persistent pain checked.` : '',
    inp.days === 2 ? 'With only 2 days, every session is full body and built on compound lifts. Keep at least 2 days between sessions.' : '',
    inp.goal === 'general' || inp.goal === 'toning' ? 'For heart health and fat loss, add 2–3 × 20–30 min of easy cardio a week, or aim for 8–10k steps a day.' : '',
    'Every 6th week, take a deload: same exercises with about half the sets and lighter weights, then start again a little stronger.',
  ].filter(Boolean);

  const name = focus.length ? `${focus.map((f) => f[0].toUpperCase() + f.slice(1)).slice(0, 2).join(' & ')} focus · ${inp.days}×/week` : `${{ muscle: 'Muscle', strength: 'Strength', general: 'Fitness', toning: 'Toning' }[inp.goal]} · ${inp.days}×/week`;
  return { name, summary: `${inp.days} days · ~${inp.minutes} min · ${{ gym: 'gym', home: 'home dumbbells', bodyweight: 'bodyweight & bands' }[inp.equipment]}`, days, weekly, targets, notes };
}

export function programTemplates(p: Program, pid: string): Template[] {
  return p.days.map((d, i) => ({ id: `prog-${pid}-${i}`, name: d.name, exercises: d.exercises.map((x) => ({ exerciseId: x.exerciseId, sets: x.sets, reps: x.reps, restSec: x.restSec })) }));
}

export const PRESETS: { key: string; label: string; apply: (p: ProgramInputs) => Partial<ProgramInputs> }[] = [
  { key: 'glutes', label: 'Glute focus, light rest', apply: () => ({ goal: 'muscle', priorities: { ...all('light'), glutes: 'focus', hamstrings: 'normal', core: 'light' } }) },
  { key: 'minimal', label: '2× a week, max effect', apply: () => ({ days: 2, minutes: 60, priorities: all('normal') }) },
  { key: 'balanced', label: 'Balanced muscle', apply: () => ({ goal: 'muscle', priorities: all('normal') }) },
  { key: 'upper', label: 'Upper body focus', apply: () => ({ goal: 'muscle', priorities: { ...all('light'), chest: 'focus', back: 'focus', shoulders: 'focus', biceps: 'normal', triceps: 'normal' } }) },
  { key: 'strength', label: 'Get stronger (big lifts)', apply: () => ({ goal: 'strength', priorities: { ...all('normal'), calves: 'light', biceps: 'light', triceps: 'light' } }) },
  { key: 'arms', label: 'Arms & shoulders', apply: () => ({ goal: 'muscle', priorities: { ...all('normal'), shoulders: 'focus', biceps: 'focus', triceps: 'focus', calves: 'light' } }) },
];

export function all(p: Priority): Record<Muscle, Priority> {
  return Object.fromEntries(MUSCLES.map((m) => [m.key, p])) as Record<Muscle, Priority>;
}
