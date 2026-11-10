import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardioActivity, CardioLog, MuscleGroup, Session, Template } from '../types';
import { mutate, useAppState, getState } from '../lib/storage';
import { e1rm, workingSets, allExercises, detectPRs, exerciseHistory, exerciseName, loadRatio, pace, RPE_LABELS, sessionKcal, sessionKind, sessionLoad, sessionSets, sessionVolume, weeklySummaries } from '../lib/training';
import { CARDIO } from '../data/exercises';
import { fmt, fmtDuration, fmtPace, prettyDate, today, uid } from '../lib/util';
import { EmptyState, NumField, Sheet, Stat } from "../components/ui";
import { askConfirm } from '../components/confirm';
import { celebrate, confetti, haptic, sound, useCountUp } from '../lib/fx';
import { Trophy } from 'lucide-react';
import { progression, readiness } from '../lib/readiness';
import { ReadinessCard } from '../components/Readiness';
import { ProgramBuilder, ProgramCard } from './ProgramBuilder';
import { tr } from '../i18n';

const MUSCLES: MuscleGroup[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core', 'Full body'];

export function startWorkout(t?: Template) {
  const s = getState();
  mutate((st) => {
    st.active = {
      name: t?.name ?? 'Workout', startedAt: Date.now(), cardio: [], restSec: 120,
      exercises: (t?.exercises ?? []).map((te) => {
        // Pre-fill with today's suggestion (progression + readiness).
        const p = progression(s, te.exerciseId, te.reps, readiness(s));
        return { exerciseId: te.exerciseId, restSec: te.restSec, targetReps: te.reps, sets: Array.from({ length: te.sets }, () => ({ reps: p.reps, weight: p.weight, done: false })) };
      }),
    };
  });
}

export function Train() {
  const s = useAppState();
  const [cardioOpen, setCardioOpen] = useState(false);
  const [detail, setDetail] = useState<Session | null>(null);
  const [tplEdit, setTplEdit] = useState<Template | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [builder, setBuilder] = useState(false);
  const summarySheet = summary && <SavedSummary summary={summary} onClose={() => setSummary(null)} />;
  if (s.active) return <><ActiveWorkoutView onSaved={setSummary} />{summarySheet}</>;
  const week = weeklySummaries(s, 1)[0];
  const ratio = loadRatio(s);
  const sessions = [...s.sessions].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div>
      <div className="page-head"><h1>{tr("Training")}</h1></div>
      <ProgramCard onBuild={() => setBuilder(true)} />
      <ProgramBuilder open={builder} onClose={() => setBuilder(false)} />
      <div className="card">
        <h2>{tr("Start")}</h2>
        <div className="grid2">
          <button className="btn primary" onClick={() => startWorkout()}>{tr("🏋️ Empty workout")}</button>
          <button className="btn" onClick={() => setCardioOpen(true)}>{tr("🏃 Log run / cardio")}</button>
        </div>
        <h3 style={{ marginTop: 16 }}>{tr("Templates")}</h3>
        {s.templates.map((t) => (
          <div key={t.id} className="list-item">
            <div className="grow click" style={{ cursor: 'pointer' }} onClick={() => startWorkout(t)}>
              <div>{t.name}</div>
              <div className="tiny muted">{t.exercises.map((e) => exerciseName(s, e.exerciseId)).join(' · ')}</div>
            </div>
            <button className="btn sm ghost" onClick={() => setTplEdit(t)}>{tr("Edit")}</button>
            <button className="btn sm" onClick={() => startWorkout(t)}>{tr("Start")}</button>
          </div>
        ))}
        <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setTplEdit({ id: 't-' + uid(), name: 'New template', exercises: [] })}>{tr("+ New template")}</button>
      </div>

      <div className="card">
        <h2>{tr("This week's effort")}</h2>
        <div className="grid4">
          <Stat v={week.sessions} l="sessions" />
          <Stat v={fmt(week.load)} l="load (RPE×min)" />
          <Stat v={week.sessions ? fmt(week.avgRpe, 1) : '–'} l="avg effort /10" />
          <Stat v={fmtDuration(week.minutes)} l="time trained" />
        </div>
        <p className="small" style={{ marginTop: 10 }}>
          <span className={'pill ' + (ratio.ratio && ratio.ratio > 1.3 ? 'warn' : 'accent')}>{ratio.ratio ? `${fmt(ratio.ratio, 2)}×` : '—'}</span>{' '}
          {ratio.status} <span className="muted tiny">{tr("(last 7 days vs 4-week average)")}</span>
        </p>
      </div>

      <div className="card">
        <h2>{tr("History")}</h2>
        {sessions.length === 0 && <EmptyState kind="dumbbell" title={tr("No workouts yet")} text={tr("Start a template above. Your history, PRs and effort will build up here.")} />}
        {sessions.slice(0, 50).map((x) => (
          <div key={x.id} className="list-item click" onClick={() => setDetail(x)}>
            <div className="grow">
              <div>{x.name} <span className="pill">{sessionKind(x)}</span></div>
              <div className="tiny muted">{prettyDate(x.date)} · {fmtDuration(x.durationMin)}{' '}{tr("· effort")}{' '}{x.rpe}/10
                {x.exercises.length > 0 && tr(" · {v0} sets · {v1} kg", { v0: sessionSets(x), v1: fmt(sessionVolume(x)) })}
                {x.cardio.map((c, i) => <span key={i}> · {CARDIO.find((a) => a.key === c.activity)?.label}{c.distanceKm ? tr(" {v0} km", { v0: fmt(c.distanceKm, 2) }) : ''}</span>)}
              </div>
            </div>
            <span className="num small muted">{fmt(sessionLoad(x))}</span>
          </div>
        ))}
      </div>

      <CardioSheet open={cardioOpen} onClose={() => setCardioOpen(false)} />
      <SessionDetail session={detail} onClose={() => setDetail(null)} />
      {summarySheet}
      {tplEdit && <TemplateEditor template={tplEdit} onClose={() => setTplEdit(null)} />}
    </div>
  );
}

// ---------------- Active workout ----------------

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}

function ActiveWorkoutView({ onSaved }: { onSaved: (s: Summary) => void }) {
  const s = useAppState();
  const a = s.active!;
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [cardio, setCardio] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const elapsed = Math.floor((now - a.startedAt) / 1000);
  const restLeft = a.restEndsAt ? Math.ceil((a.restEndsAt - now) / 1000) : 0;

  useEffect(() => {
    if (a.restEndsAt && restLeft <= 0) {
      haptic('double'); sound('done');
      mutate((st) => { if (st.active) st.active.restEndsAt = undefined; });
    }
  }, [restLeft, a.restEndsAt]);

  const upd = (fn: (w: NonNullable<typeof s.active>) => void) => mutate((st) => { if (st.active) fn(st.active); });

  return (
    <div>
      <div className="page-head">
        <input value={a.name} onChange={(e) => upd((w) => { w.name = e.target.value; })} style={{ fontSize: '1.2rem', fontWeight: 700, maxWidth: 260 }} />
        <span className="num muted">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
      </div>

      <ReadinessCard compact onApply={() => upd((w) => {
        const st = getState();
        for (const e of w.exercises) {
          const p = progression(st, e.exerciseId, e.targetReps, readiness(st));
          if (p.kind === 'first') continue;
          for (const set of e.sets) if (!set.done && !set.warmup) { set.weight = p.weight; set.reps = p.reps; }
        }
      })} />

      {restLeft > 0 && (
        <div className="rest-banner">
          <span className="row" style={{ gap: 10 }}>
            <svg className="rest-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="5" /><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="100.5" strokeDashoffset={100.5 * (1 - restLeft / (a.restTotal ?? Math.max(restLeft, 1)))} /></svg>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>{tr("Rest")}{' '}{Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}</span>
          </span>
          <span className="row">
            <button className="btn sm" onClick={() => upd((w) => { w.restEndsAt = (w.restEndsAt ?? Date.now()) + 30000; w.restTotal = (w.restTotal ?? 0) + 30; })}>+30s</button>
            <button className="btn sm" onClick={() => upd((w) => { w.restEndsAt = undefined; })}>{tr("Skip")}</button>
          </span>
        </div>
      )}

      {a.exercises.map((ex, ei) => {
        const hist = exerciseHistory(s, ex.exerciseId);
        const last = hist.at(-1);
        return (
          <div className="card" key={ei}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>{exerciseName(s, ex.exerciseId)}</h2>
              <button className="icon-btn" title={tr("Remove exercise")} onClick={async () => (await askConfirm(tr("Remove this exercise?"), tr("Remove"))) && upd((w) => { w.exercises.splice(ei, 1); })}>✕</button>
            </div>
            <Suggestion exerciseId={ex.exerciseId} targetReps={ex.targetReps} onApply={(wgt, reps) => upd((w) => { for (const set of w.exercises[ei].sets) if (!set.done && !set.warmup) { set.weight = wgt; set.reps = reps; } })} />
            {last && <div className="tiny muted">{tr("Last time (")}{prettyDate(last.date)}): {last.sets.map((x) => `${fmt(x.weight, 1)}×${x.reps}`).join(', ')}{' '}{tr("· best e1RM")}{' '}{fmt(Math.max(...hist.map((h) => h.e1rm)), 1)}{' '}{tr("kg")}</div>}
            <div className="set-row tiny muted" style={{ marginTop: 10 }}><span>{tr("Set")}</span><span>{tr("kg")}</span><span>{tr("Reps")}</span><span>{tr("RPE")}</span><span /></div>
            {ex.sets.map((set, si) => (
              <div key={si} className={'set-row' + (set.done ? ' done' : '')}>
                <button className="btn sm ghost" title={tr("Toggle warm-up")} onClick={() => upd((w) => { w.exercises[ei].sets[si].warmup = !set.warmup; })}>{set.warmup ? 'W' : si + 1 - ex.sets.slice(0, si).filter((x) => x.warmup).length}</button>
                <input type="number" inputMode="decimal" step={0.5} value={set.weight || ''} placeholder="0" onChange={(e) => upd((w) => { w.exercises[ei].sets[si].weight = +e.target.value; })} />
                <input type="number" inputMode="numeric" value={set.reps || ''} placeholder="0" onChange={(e) => upd((w) => { w.exercises[ei].sets[si].reps = +e.target.value; })} />
                <input type="number" inputMode="decimal" min={1} max={10} step={0.5} value={set.rpe ?? ''} placeholder="–" onChange={(e) => upd((w) => { w.exercises[ei].sets[si].rpe = e.target.value ? Math.min(10, Math.max(1, +e.target.value)) : undefined; })} />
                <button className={'check' + (set.done ? ' on' : '')} aria-label={tr("Complete set")} onClick={() => upd((w) => {
                  const st = w.exercises[ei].sets[si];
                  st.done = !st.done;
                  if (st.done && !st.warmup) { const sec = ex.restSec ?? w.restSec; w.restEndsAt = Date.now() + sec * 1000; w.restTotal = sec; }
                  if (st.done) { haptic('tick'); sound('tick'); }
                })}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></button>
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => upd((w) => { const prev = w.exercises[ei].sets.at(-1); w.exercises[ei].sets.push({ reps: prev?.reps ?? 8, weight: prev?.weight ?? 0, done: false }); })}>{tr("+ Set")}</button>
              {ex.sets.length > 0 && <button className="btn sm ghost" onClick={() => upd((w) => { w.exercises[ei].sets.pop(); })}>{tr("− Set")}</button>}
              <span className="grow" />
              <label className="tiny muted row" style={{ gap: 4 }}>{tr("Rest")}
                <select style={{ width: 80, padding: '4px 6px' }} value={ex.restSec ?? a.restSec} onChange={(e) => upd((w) => { w.exercises[ei].restSec = +e.target.value; })}>
                  {[30, 60, 90, 120, 150, 180, 240, 300].map((x) => <option key={x} value={x}>{x < 60 ? `${x}s` : `${x / 60}m`}</option>)}
                </select>
              </label>
            </div>
          </div>
        );
      })}

      {a.cardio.map((c, ci) => (
        <div className="card" key={'c' + ci}>
          <div className="row between">
            <h2 style={{ margin: 0 }}>{CARDIO.find((x) => x.key === c.activity)?.label}</h2>
            <button className="icon-btn" onClick={() => upd((w) => { w.cardio.splice(ci, 1); })}>✕</button>
          </div>
          <div className="small muted">{fmtDuration(c.durationMin)}{c.distanceKm ? tr(" · {v0} km · {v1}", { v0: fmt(c.distanceKm, 2), v1: fmtPace(pace(c)!) }) : ''}{c.avgHr ? tr(" · {v0} bpm", { v0: c.avgHr }) : ''}</div>
        </div>
      ))}

      <div className="grid2" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={() => setAdding(true)}>{tr("+ Exercise")}</button>
        <button className="btn" onClick={() => setCardio(true)}>{tr("+ Cardio block")}</button>
      </div>
      <div className="grid2">
        <button className="btn danger" onClick={async () => (await askConfirm(tr("Discard this workout?"), tr("Discard"))) && mutate((st) => { st.active = undefined; })}>{tr("Discard")}</button>
        <button className="btn primary" onClick={() => setFinishing(true)}>{tr("Finish")}</button>
      </div>

      <ExercisePicker open={adding} onClose={() => setAdding(false)} onPick={(id) => {
        upd((w) => { const st = getState(); const p = progression(st, id, undefined, readiness(st)); w.exercises.push({ exerciseId: id, sets: [{ reps: p.reps, weight: p.weight, done: false }] }); });
        setAdding(false);
      }} />
      <CardioForm open={cardio} onClose={() => setCardio(false)} onSave={(c) => { upd((w) => { w.cardio.push(c); }); setCardio(false); }} />
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} onSaved={onSaved} elapsedMin={Math.max(1, Math.round(elapsed / 60))} />
    </div>
  );
}

const SUGGEST_STYLE: Record<string, [string, string]> = {
  increase: ['⬆', 'var(--accent)'], reps: ['➕', 'var(--protein)'], hold: ['⏸', 'var(--muted)'],
  deload: ['⬇', 'var(--warn)'], easy: ['🫶', 'var(--warn)'], first: ['🆕', 'var(--muted)'],
};

function Suggestion({ exerciseId, targetReps, onApply }: { exerciseId: string; targetReps?: number; onApply: (w: number, r: number) => void }) {
  const s = useAppState();
  const p = progression(s, exerciseId, targetReps, readiness(s));
  const [ico, color] = SUGGEST_STYLE[p.kind];
  const sets = s.active?.exercises.find((e) => e.exerciseId === exerciseId)?.sets.filter((x) => !x.done && !x.warmup) ?? [];
  const applied = sets.length > 0 && sets.every((x) => x.weight === p.weight && x.reps === p.reps);
  return (
    <div style={{ margin: '6px 0', padding: '8px 10px', borderRadius: 10, background: 'var(--surface-2)', borderLeft: `3px solid ${color}` }}>
      <div className="row between">
        <strong className="small">{ico} {p.text}</strong>
        {p.kind !== 'first' && sets.length > 0 && (applied ? <span className="tiny muted">{tr("applied")}</span> : <button className="btn sm" onClick={() => onApply(p.weight, p.reps)}>{tr("Apply")}</button>)}
      </div>
      <div className="tiny muted" style={{ marginTop: 2 }}>{p.why}</div>
    </div>
  );
}

function RpePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="rpe-grid">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <button key={n} className={n === value ? 'on' : ''} onClick={() => onChange(n)} type="button">{n}</button>)}
      </div>
      <p className="small muted" style={{ textAlign: 'center' }}>{RPE_LABELS[value]}</p>
    </div>
  );
}

type Summary = { prs: ReturnType<typeof detectPRs>; session: Session };

function CountStat({ value, suffix = '', label, delay }: { value: number; suffix?: string; label: string; delay: number }) {
  const [go, setGo] = useState(false);
  useEffect(() => { const id = setTimeout(() => setGo(true), delay); return () => clearTimeout(id); }, [delay]);
  const v = useCountUp(go ? value : 0, 800, 0);
  return <div className="stat rise" style={{ animationDelay: `${delay}ms` }}><div className="v num">{fmt(v)}{suffix}</div><div className="l">{label}</div></div>;
}

function SavedSummary({ summary, onClose }: { summary: Summary; onClose: () => void }) {
  const s = useAppState();
  const goldRef = useRef<HTMLDivElement>(null);
  const x = summary.session;
  const vol = sessionVolume(x);
  const prev = [...s.sessions].filter((y) => y.name === x.name && y.id !== x.id && y.startedAt < x.startedAt).sort((a, b) => b.startedAt - a.startedAt)[0];
  const volDelta = prev && sessionVolume(prev) > 0 && vol > 0 ? Math.round(((vol - sessionVolume(prev)) / sessionVolume(prev)) * 100) : undefined;
  const prs = summary.prs.map((p) => {
    const before = exerciseHistory(s, p.exerciseId).filter((h) => h.sessionId !== x.id);
    const prevBest = Math.max(0, ...before.map((h) => (p.kind === 'e1RM' ? h.e1rm : h.topWeight)));
    const best = workingSets(x.exercises.find((e) => e.exerciseId === p.exerciseId)?.sets ?? []).sort((a, b) => e1rm(b.weight, b.reps) - e1rm(a.weight, a.reps))[0];
    return { ...p, name: exerciseName(s, p.exerciseId), delta: p.value - prevBest, set: best };
  });
  useEffect(() => {
    const id = setTimeout(() => (prs.length ? celebrate(goldRef.current, 120) : (confetti(null, 50), haptic('success'))), 250);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet open onClose={onClose} title={tr("Workout done 💪")}>
      <div className="grid2">
        <CountStat value={x.durationMin} suffix=" min" label={tr("duration")} delay={0} />
        <CountStat value={vol} suffix=" kg" label={tr("total lifted")} delay={120} />
        <CountStat value={sessionKcal(x, s.profile.weightKg)} label={tr("≈ kcal burned")} delay={240} />
        <CountStat value={x.rpe} suffix="/10" label={tr("effort")} delay={360} />
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
        {prs.length > 0 && <span className="pill accent pop" style={{ animationDelay: '.6s' }}>🏆 {prs.length}{' '}{tr("new PR")}{prs.length > 1 ? 's' : ''}</span>}
        {volDelta !== undefined && <span className={'pill pop ' + (volDelta >= 0 ? 'accent' : '')} style={{ animationDelay: '.75s' }}>{tr("Volume")}{' '}{volDelta >= 0 ? '+' : ''}{volDelta}{tr("% vs last")}{' '}{x.name}</span>}
        <span className="pill pop" style={{ animationDelay: '.9s' }}>{sessionSets(x)}{' '}{tr("set")}{sessionSets(x) === 1 ? '' : 's'}</span>
      </div>
      {prs.map((p, i) => (
        <div key={i} ref={i === 0 ? goldRef : undefined} className="gold-card go" style={{ marginTop: 12, animationDelay: `${0.3 + i * 0.15}s` }}>
          <div className="row between"><Trophy size={30} color="var(--accent-2)" aria-hidden="true" />{p.delta > 0 && <span className="delta">+{fmt(p.delta, 1)}{' '}{tr("kg")}</span>}</div>
          <div className="tiny muted" style={{ marginTop: 6 }}>{tr("New PR ·")}{' '}{p.name}</div>
          <div className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.7rem', lineHeight: 1.1 }}>{p.set ? tr("{v0} kg × {v1}", { v0: fmt(p.set.weight, 1), v1: p.set.reps }) : tr("{v0} kg", { v0: fmt(p.value, 1) })}</div>
          <div className="tiny muted">{p.kind === 'e1RM' ? tr("Estimated 1RM {v0} kg · best ever", { v0: fmt(p.value, 1) }) : tr("Heaviest ever: {v0} kg", { v0: fmt(p.value, 1) })}</div>
        </div>
      ))}
      <button className="btn primary block" style={{ marginTop: 16 }} onClick={onClose}>{tr("Done")}</button>
    </Sheet>
  );
}

function FinishSheet({ open, onClose, onSaved, elapsedMin }: { open: boolean; onClose: () => void; onSaved: (s: Summary) => void; elapsedMin: number }) {
  const [rpe, setRpe] = useState(7);
  const [dur, setDur] = useState<number | undefined>(elapsedMin);
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) setDur(elapsedMin); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const st = getState();
    const a = st.active!;
    const session: Session = {
      id: uid(), date: today(), name: a.name || 'Workout', startedAt: a.startedAt, endedAt: Date.now(), durationMin: dur ?? elapsedMin, rpe, notes: notes || undefined, cardio: a.cardio,
      exercises: a.exercises.map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) })).filter((e) => e.sets.length > 0),
    };
    const prs = detectPRs(st, session);
    onSaved({ prs, session });
    mutate((d) => { d.sessions.push(session); d.active = undefined; });
  };

  return (
    <Sheet open={open} onClose={onClose} title={tr("Finish workout")}>
      <div className="stack">
        <div><h3>{tr("How hard was the whole session?")}</h3><RpePicker value={rpe} onChange={setRpe} /></div>
        <NumField label={tr("Duration")} suffix="min" value={dur} onChange={setDur} />
        <label className="field"><span>{tr("Notes")}</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <p className="tiny muted">{tr("Only completed (✓) sets are saved.")}</p>
        <button className="btn primary block" onClick={save}>{tr("Save workout")}</button>
      </div>
    </Sheet>
  );
}

// ---------------- Cardio ----------------

function CardioForm({ open, onClose, onSave, withRpe }: { open: boolean; onClose: () => void; onSave: (c: CardioLog, extra: { rpe: number; date: string; notes: string }) => void; withRpe?: boolean }) {
  const [activity, setActivity] = useState<CardioActivity>('run');
  const [dur, setDur] = useState<number | undefined>(30);
  const [dist, setDist] = useState<number | undefined>();
  const [hr, setHr] = useState<number | undefined>();
  const [elev, setElev] = useState<number | undefined>();
  const [rpe, setRpe] = useState(6);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const def = CARDIO.find((c) => c.key === activity)!;
  const p = dist && dur ? dur / dist : undefined;
  return (
    <Sheet open={open} onClose={onClose} title={withRpe ? tr("Log run / cardio") : tr("Add cardio block")}>
      <div className="stack">
        <label className="field"><span>{tr("Activity")}</span>
          <select value={activity} onChange={(e) => setActivity(e.target.value as CardioActivity)}>{CARDIO.map((c) => <option key={c.key} value={c.key}>{tr(c.label)}</option>)}</select>
        </label>
        <div className="grid2">
          <NumField label={tr("Duration")} suffix="min" value={dur} onChange={setDur} step={0.5} />
          {def.distance && <NumField label={tr("Distance")} suffix="km" value={dist} onChange={setDist} step={0.01} />}
          <NumField label={tr("Avg heart rate")} suffix="bpm" value={hr} onChange={setHr} />
          {def.distance && <NumField label={tr("Elevation gain")} suffix="m" value={elev} onChange={setElev} />}
        </div>
        {p && activity === 'run' && <p className="small muted">{tr("Pace")}{' '}{fmtPace(p)} · {fmt(60 / p, 1)}{' '}{tr("km/h")}</p>}
        {withRpe && (
          <>
            <div><h3>{tr("Effort (RPE)")}</h3><RpePicker value={rpe} onChange={setRpe} /></div>
            <label className="field"><span>{tr("Date")}</span><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field"><span>{tr("Notes")}</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          </>
        )}
        <button className="btn primary block" disabled={!dur} onClick={() => onSave({ activity, durationMin: dur!, distanceKm: def.distance ? dist : undefined, avgHr: hr, elevationM: def.distance ? elev : undefined }, { rpe, date, notes })}>{tr("Save")}</button>
      </div>
    </Sheet>
  );
}

function CardioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <CardioForm open={open} onClose={onClose} withRpe onSave={(c, { rpe, date, notes }) => {
      const label = CARDIO.find((x) => x.key === c.activity)!.label;
      const startedAt = date === today() ? Date.now() - c.durationMin * 60000 : new Date(date + 'T12:00').getTime();
      mutate((st) => { st.sessions.push({ id: uid(), date, name: label, startedAt, endedAt: startedAt + c.durationMin * 60000, durationMin: c.durationMin, rpe, exercises: [], cardio: [c], notes: notes || undefined }); });
      onClose();
    }} />
  );
}

// ---------------- Pickers, details, templates ----------------

function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const s = useAppState();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | ''>('');
  const list = useMemo(() => allExercises(s).filter((e) => (!muscle || e.muscle === muscle) && e.name.toLowerCase().includes(q.toLowerCase())), [s, q, muscle]);
  const create = () => {
    const id = 'cx-' + uid();
    mutate((st) => { st.exercises.push({ id, name: q.trim(), muscle: muscle || 'Full body', equipment: 'Other', custom: true }); });
    onPick(id); setQ('');
  };
  return (
    <Sheet open={open} onClose={onClose} title={tr("Add exercise")}>
      <div className="stack">
        <input autoFocus placeholder={tr("Search exercises")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row wrap" style={{ gap: 6 }}>
          {MUSCLES.map((m) => <button key={m} className={'btn sm' + (muscle === m ? ' primary' : '')} onClick={() => setMuscle(muscle === m ? '' : m)}>{m}</button>)}
        </div>
        <div>
          {list.map((e) => (
            <div key={e.id} className="list-item click" onClick={() => { onPick(e.id); setQ(''); }}>
              <span className="grow">{e.name}</span><span className="tiny muted">{e.muscle} · {e.equipment}</span>
            </div>
          ))}
          {q.trim() && !list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase()) && (
            <button className="btn block" style={{ marginTop: 8 }} onClick={create}>{tr("Create “")}{q.trim()}”{muscle ? ` (${muscle})` : ''}</button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function SessionDetail({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const s = useAppState();
  if (!session) return null;
  const x = session;
  return (
    <Sheet open onClose={onClose} title={x.name}>
      <p className="small muted">{prettyDate(x.date)} · {sessionKind(x)}{' '}{tr("· effort")}{' '}{x.rpe}/10 ({RPE_LABELS[x.rpe]})</p>
      <div className="grid3" style={{ margin: '12px 0' }}>
        <Stat v={fmtDuration(x.durationMin)} l="duration" />
        <Stat v={fmt(sessionLoad(x))} l="training load" />
        <Stat v={fmt(sessionKcal(x, s.profile.weightKg))} l="≈ kcal" />
      </div>
      {x.exercises.map((e, i) => (
        <div key={i} className="list-item" style={{ display: 'block' }}>
          <div className="small"><strong>{exerciseName(s, e.exerciseId)}</strong></div>
          <div className="tiny muted">{e.sets.map((set) => `${set.warmup ? 'W ' : ''}${fmt(set.weight, 1)}kg×${set.reps}${set.rpe ? ` @${set.rpe}` : ''}`).join(' · ')}</div>
        </div>
      ))}
      {x.cardio.map((c, i) => (
        <div key={'c' + i} className="list-item" style={{ display: 'block' }}>
          <div className="small"><strong>{CARDIO.find((a) => a.key === c.activity)?.label}</strong></div>
          <div className="tiny muted">{fmtDuration(c.durationMin)}{c.distanceKm ? tr(" · {v0} km · {v1}", { v0: fmt(c.distanceKm, 2), v1: fmtPace(pace(c)!) }) : ''}{c.avgHr ? tr(" · avg {v0} bpm", { v0: c.avgHr }) : ''}{c.elevationM ? ` · +${c.elevationM} m` : ''}</div>
        </div>
      ))}
      {x.notes && <p className="small" style={{ marginTop: 10 }}>📝 {x.notes}</p>}
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn danger" onClick={async () => { if (await askConfirm(tr("Delete this session?"), tr("Delete"))) { mutate((st) => { st.sessions = st.sessions.filter((y) => y.id !== x.id); }); onClose(); } }}>{tr("Delete")}</button>
        {x.exercises.length > 0 && <button className="btn grow" onClick={() => {
          mutate((st) => { st.templates.push({ id: 't-' + uid(), name: x.name + ' (copy)', exercises: x.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter((z) => !z.warmup).length, reps: e.sets.at(-1)?.reps ?? 8, restSec: e.restSec ?? 120 })) }); });
          onClose();
        }}>{tr("Save as template")}</button>}
      </div>
    </Sheet>
  );
}

function TemplateEditor({ template, onClose }: { template: Template; onClose: () => void }) {
  const s = useAppState();
  const [t, setT] = useState<Template>(structuredClone(template));
  const [adding, setAdding] = useState(false);
  const exists = s.templates.some((x) => x.id === t.id);
  const save = () => { mutate((st) => { const i = st.templates.findIndex((x) => x.id === t.id); if (i >= 0) st.templates[i] = t; else st.templates.push(t); }); onClose(); };
  const setEx = (i: number, k: 'sets' | 'reps' | 'restSec', v: number) => setT((x) => ({ ...x, exercises: x.exercises.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }));
  return (
    <>
      <Sheet open={!adding} onClose={onClose} title={tr("Template")}>
        <div className="stack">
          <label className="field"><span>{tr("Name")}</span><input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></label>
          <div className="row tiny muted"><span className="grow">{tr("Exercise")}</span><span style={{ width: 56 }}>{tr("Sets")}</span><span style={{ width: 56 }}>{tr("Reps")}</span><span style={{ width: 64 }}>{tr("Rest s")}</span><span style={{ width: 30 }} /></div>
          {t.exercises.map((e, i) => (
            <div key={i} className="row">
              <span className="grow small">{exerciseName(s, e.exerciseId)}</span>
              <input style={{ width: 56, padding: 6 }} type="number" value={e.sets} onChange={(ev) => setEx(i, 'sets', +ev.target.value)} />
              <input style={{ width: 56, padding: 6 }} type="number" value={e.reps} onChange={(ev) => setEx(i, 'reps', +ev.target.value)} />
              <input style={{ width: 64, padding: 6 }} type="number" step={15} value={e.restSec} onChange={(ev) => setEx(i, 'restSec', +ev.target.value)} />
              <button className="icon-btn" style={{ width: 30 }} onClick={() => setT({ ...t, exercises: t.exercises.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn sm" onClick={() => setAdding(true)}>{tr("+ Exercise")}</button>
          <div className="row">
            {exists && <button className="btn danger" onClick={async () => { if (await askConfirm(tr("Delete this template?"), tr("Delete"))) { mutate((st) => { st.templates = st.templates.filter((x) => x.id !== t.id); }); onClose(); } }}>{tr("Delete")}</button>}
            <button className="btn primary grow" onClick={save} disabled={!t.name.trim()}>{tr("Save template")}</button>
          </div>
        </div>
      </Sheet>
      <ExercisePicker open={adding} onClose={() => setAdding(false)} onPick={(id) => { setT((x) => ({ ...x, exercises: [...x.exercises, { exerciseId: id, sets: 3, reps: 10, restSec: 90 }] })); setAdding(false); }} />
    </>
  );
}


