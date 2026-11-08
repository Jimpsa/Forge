// Menstrual-cycle awareness. Evidence (e.g. McNulty et al. 2020, Sports Med) shows cycle effects on strength and
// performance are small and highly individual, so this module is symptom-led and learns the user's own pattern
// instead of applying fixed phase rules.
import type { AppState } from '../types';
import { addDays, parseDate, today } from './util';
import { e1rm, workingSets } from './training';

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | 'late-luteal';

export const PHASE_INFO: Record<CyclePhase, { label: string; note: string }> = {
  menstrual: { label: 'Period', note: 'Some feel low energy or cramps; many feel fine. With symptoms, going easier is fine — without them, train as normal. Iron-rich food (red meat, eggs, legumes) helps replace losses.' },
  follicular: { label: 'Follicular', note: 'Many feel energetic and recover well here. A good window to push for progress if you feel it.' },
  ovulatory: { label: 'Around ovulation', note: 'Energy is often high. Nothing needs to change — train as planned.' },
  luteal: { label: 'Luteal', note: 'Body temperature and resting heart rate rise a little; hard or hot sessions can feel tougher, and appetite may increase. Hydrate well and go by feel.' },
  'late-luteal': { label: 'Pre-period', note: 'PMS can affect sleep, mood and motivation for some. Go by how you feel — your check-in adjusts today’s advice.' },
};

const days = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);

export function periodStarts(s: AppState): string[] {
  const set = new Set(s.periodStarts ?? []);
  // Also derive starts from check-ins marked "period": a period day with no period day in the 5 days before.
  const pdays = (s.gut ?? []).filter((g) => g.period).map((g) => g.date).sort();
  for (const d of pdays) if (!pdays.some((x) => x < d && days(x, d) <= 5) && ![...set].some((x) => Math.abs(days(x, d)) <= 5)) set.add(d);
  return [...set].sort();
}

export function cycleLength(s: AppState) {
  const st = periodStarts(s);
  const gaps = st.slice(1).map((d, i) => days(st[i], d)).filter((g) => g >= 18 && g <= 45).slice(-6);
  return gaps.length >= 2 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : s.profile.cycle?.typicalLength ?? 28;
}

export interface CycleInfo { day: number; length: number; phase: CyclePhase; label: string; note: string; nextIn: number; hormonal: boolean; estimated: boolean }

export function cycleInfo(s: AppState, date = today()): CycleInfo | undefined {
  const c = s.profile.cycle;
  if (s.profile.sex !== 'female' || !c?.track) return undefined;
  const st = periodStarts(s).filter((d) => d <= date);
  const last = st.at(-1);
  if (!last) return undefined;
  const length = cycleLength(s);
  const day = days(last, date) + 1;
  const ov = length - 14; // ovulation ≈ 14 days before the next period
  const onPeriod = (s.gut ?? []).find((g) => g.date === date)?.period;
  const phase: CyclePhase =
    onPeriod || day <= 5 ? 'menstrual' : day < ov - 1 ? 'follicular' : day <= ov + 1 ? 'ovulatory' : day > length - 5 ? 'late-luteal' : 'luteal';
  const hormonal = c.contraception === 'hormonal';
  const info = PHASE_INFO[phase];
  return {
    day, length, phase, hormonal, estimated: day > length + 3,
    label: hormonal ? (phase === 'menstrual' ? 'Bleed' : `Day ${day}`) : info.label,
    note: hormonal ? 'Hormonal contraception largely evens out natural hormone swings, so the app goes by your symptoms rather than phases.' : info.note,
    nextIn: Math.max(0, length - day + 1),
  };
}

/** Your own strength pattern by phase: avg performance vs your usual (100 = typical). Needs data from ≥2 cycles. */
export function phasePerformance(s: AppState) {
  const c = s.profile.cycle;
  if (!c?.track || c.contraception === 'hormonal' || periodStarts(s).length < 3) return [];
  // Per exercise median e1RM as the "usual" reference.
  const byEx = new Map<string, number[]>();
  for (const x of s.sessions) for (const e of x.exercises) {
    const best = Math.max(0, ...workingSets(e.sets).filter((z) => z.reps <= 12).map((z) => e1rm(z.weight, z.reps)));
    if (best > 0) byEx.set(e.exerciseId, [...(byEx.get(e.exerciseId) ?? []), best]);
  }
  const median = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const ref = new Map([...byEx].filter(([, v]) => v.length >= 3).map(([k, v]) => [k, median(v)]));
  const groups = new Map<CyclePhase, { perf: number[]; rpe: number[] }>();
  for (const x of s.sessions) {
    const info = cycleInfo(s, x.date);
    if (!info || info.estimated) continue;
    const ratios = x.exercises.map((e) => {
      const r = ref.get(e.exerciseId);
      const best = Math.max(0, ...workingSets(e.sets).filter((z) => z.reps <= 12).map((z) => e1rm(z.weight, z.reps)));
      return r && best ? best / r : undefined;
    }).filter((v): v is number => v !== undefined);
    if (!ratios.length) continue;
    const g = groups.get(info.phase) ?? { perf: [], rpe: [] };
    g.perf.push(ratios.reduce((a, b) => a + b, 0) / ratios.length);
    g.rpe.push(x.rpe);
    groups.set(info.phase, g);
  }
  return (Object.keys(PHASE_INFO) as CyclePhase[])
    .map((ph) => ({ phase: ph, label: PHASE_INFO[ph].label, n: groups.get(ph)?.perf.length ?? 0, perf: groups.get(ph) ? (100 * groups.get(ph)!.perf.reduce((a, b) => a + b, 0)) / groups.get(ph)!.perf.length : undefined, rpe: groups.get(ph) ? groups.get(ph)!.rpe.reduce((a, b) => a + b, 0) / groups.get(ph)!.rpe.length : undefined }))
    .filter((x) => x.n >= 3);
}

export const addPeriodStart = (date: string) => (st: AppState) => {
  st.periodStarts = [...new Set([...(st.periodStarts ?? []).filter((d) => Math.abs(days(d, date)) > 5), date])].sort();
  const g = (st.gut ?? []).find((x) => x.date === date);
  if (g) g.period = true; // don't create an empty check-in: that would read as "no symptoms"
};

export const nextPeriodDate = (s: AppState) => { const c = cycleInfo(s); return c ? addDays(today(), c.nextIn) : undefined; };
