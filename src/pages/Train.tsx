import { useEffect, useMemo, useState } from 'react';
import type { CardioActivity, CardioLog, MuscleGroup, Session, Template } from '../types';
import { mutate, useAppState, getState } from '../lib/storage';
import { allExercises, detectPRs, exerciseHistory, exerciseName, loadRatio, pace, RPE_LABELS, sessionKcal, sessionKind, sessionLoad, sessionSets, sessionVolume, weeklySummaries } from '../lib/training';
import { CARDIO } from '../data/exercises';
import { fmt, fmtDuration, fmtPace, prettyDate, today, uid } from '../lib/util';
import { NumField, Sheet, Stat } from "../components/ui";
import { askConfirm } from '../components/confirm';

const MUSCLES: MuscleGroup[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core', 'Full body'];

export function startWorkout(t?: Template) {
  const s = getState();
  mutate((st) => {
    st.active = {
      name: t?.name ?? 'Workout', startedAt: Date.now(), cardio: [], restSec: 120,
      exercises: (t?.exercises ?? []).map((te) => {
        const last = exerciseHistory(s, te.exerciseId).at(-1);
        return { exerciseId: te.exerciseId, restSec: te.restSec, sets: Array.from({ length: te.sets }, (_, i) => ({ reps: last?.sets[i]?.reps ?? te.reps, weight: last?.sets[i]?.weight ?? last?.topWeight ?? 0, done: false })) };
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
  const summarySheet = summary && <SavedSummary summary={summary} onClose={() => setSummary(null)} />;
  if (s.active) return <><ActiveWorkoutView onSaved={setSummary} />{summarySheet}</>;
  const week = weeklySummaries(s, 1)[0];
  const ratio = loadRatio(s);
  const sessions = [...s.sessions].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div>
      <div className="page-head"><h1>Training</h1></div>
      <div className="card">
        <h2>Start</h2>
        <div className="grid2">
          <button className="btn primary" onClick={() => startWorkout()}>🏋️ Empty workout</button>
          <button className="btn" onClick={() => setCardioOpen(true)}>🏃 Log run / cardio</button>
        </div>
        <h3 style={{ marginTop: 16 }}>Templates</h3>
        {s.templates.map((t) => (
          <div key={t.id} className="list-item">
            <div className="grow click" style={{ cursor: 'pointer' }} onClick={() => startWorkout(t)}>
              <div>{t.name}</div>
              <div className="tiny muted">{t.exercises.map((e) => exerciseName(s, e.exerciseId)).join(' · ')}</div>
            </div>
            <button className="btn sm ghost" onClick={() => setTplEdit(t)}>Edit</button>
            <button className="btn sm" onClick={() => startWorkout(t)}>Start</button>
          </div>
        ))}
        <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setTplEdit({ id: 't-' + uid(), name: 'New template', exercises: [] })}>+ New template</button>
      </div>

      <div className="card">
        <h2>This week's effort</h2>
        <div className="grid4">
          <Stat v={week.sessions} l="sessions" />
          <Stat v={fmt(week.load)} l="load (RPE×min)" />
          <Stat v={week.sessions ? fmt(week.avgRpe, 1) : '–'} l="avg effort /10" />
          <Stat v={fmtDuration(week.minutes)} l="time trained" />
        </div>
        <p className="small" style={{ marginTop: 10 }}>
          <span className={'pill ' + (ratio.ratio && ratio.ratio > 1.3 ? 'warn' : 'accent')}>{ratio.ratio ? `${fmt(ratio.ratio, 2)}×` : '—'}</span>{' '}
          {ratio.status} <span className="muted tiny">(last 7 days vs 4-week average)</span>
        </p>
      </div>

      <div className="card">
        <h2>History</h2>
        {sessions.length === 0 && <div className="empty">No sessions yet. Start one above.</div>}
        {sessions.slice(0, 50).map((x) => (
          <div key={x.id} className="list-item click" onClick={() => setDetail(x)}>
            <div className="grow">
              <div>{x.name} <span className="pill">{sessionKind(x)}</span></div>
              <div className="tiny muted">{prettyDate(x.date)} · {fmtDuration(x.durationMin)} · effort {x.rpe}/10
                {x.exercises.length > 0 && ` · ${sessionSets(x)} sets · ${fmt(sessionVolume(x))} kg`}
                {x.cardio.map((c, i) => <span key={i}> · {CARDIO.find((a) => a.key === c.activity)?.label}{c.distanceKm ? ` ${fmt(c.distanceKm, 2)} km` : ''}</span>)}
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
      navigator.vibrate?.([200, 100, 200]);
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

      {restLeft > 0 && (
        <div className="rest-banner">
          <span>Rest {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}</span>
          <span className="row">
            <button className="btn sm" onClick={() => upd((w) => { w.restEndsAt = (w.restEndsAt ?? Date.now()) + 30000; })}>+30s</button>
            <button className="btn sm" onClick={() => upd((w) => { w.restEndsAt = undefined; })}>Skip</button>
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
              <button className="icon-btn" title="Remove exercise" onClick={async () => (await askConfirm('Remove this exercise?', 'Remove')) && upd((w) => { w.exercises.splice(ei, 1); })}>✕</button>
            </div>
            {last && <div className="tiny muted">Last time ({prettyDate(last.date)}): {last.sets.map((x) => `${fmt(x.weight, 1)}×${x.reps}`).join(', ')} · best e1RM {fmt(Math.max(...hist.map((h) => h.e1rm)), 1)} kg</div>}
            <div className="set-row tiny muted" style={{ marginTop: 10 }}><span>Set</span><span>kg</span><span>Reps</span><span>RPE</span><span /></div>
            {ex.sets.map((set, si) => (
              <div key={si} className={'set-row' + (set.done ? ' done' : '')}>
                <button className="btn sm ghost" title="Toggle warm-up" onClick={() => upd((w) => { w.exercises[ei].sets[si].warmup = !set.warmup; })}>{set.warmup ? 'W' : si + 1 - ex.sets.slice(0, si).filter((x) => x.warmup).length}</button>
                <input type="number" inputMode="decimal" step={0.5} value={set.weight || ''} placeholder="0" onChange={(e) => upd((w) => { w.exercises[ei].sets[si].weight = +e.target.value; })} />
                <input type="number" inputMode="numeric" value={set.reps || ''} placeholder="0" onChange={(e) => upd((w) => { w.exercises[ei].sets[si].reps = +e.target.value; })} />
                <input type="number" inputMode="decimal" min={1} max={10} step={0.5} value={set.rpe ?? ''} placeholder="–" onChange={(e) => upd((w) => { w.exercises[ei].sets[si].rpe = e.target.value ? Math.min(10, Math.max(1, +e.target.value)) : undefined; })} />
                <button className={'check' + (set.done ? ' on' : '')} aria-label="Complete set" onClick={() => upd((w) => {
                  const st = w.exercises[ei].sets[si];
                  st.done = !st.done;
                  if (st.done && !st.warmup) w.restEndsAt = Date.now() + (ex.restSec ?? w.restSec) * 1000;
                })}>✓</button>
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => upd((w) => { const prev = w.exercises[ei].sets.at(-1); w.exercises[ei].sets.push({ reps: prev?.reps ?? 8, weight: prev?.weight ?? 0, done: false }); })}>+ Set</button>
              {ex.sets.length > 0 && <button className="btn sm ghost" onClick={() => upd((w) => { w.exercises[ei].sets.pop(); })}>− Set</button>}
              <span className="grow" />
              <label className="tiny muted row" style={{ gap: 4 }}>Rest
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
          <div className="small muted">{fmtDuration(c.durationMin)}{c.distanceKm ? ` · ${fmt(c.distanceKm, 2)} km · ${fmtPace(pace(c)!)}` : ''}{c.avgHr ? ` · ${c.avgHr} bpm` : ''}</div>
        </div>
      ))}

      <div className="grid2" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={() => setAdding(true)}>+ Exercise</button>
        <button className="btn" onClick={() => setCardio(true)}>+ Cardio block</button>
      </div>
      <div className="grid2">
        <button className="btn danger" onClick={async () => (await askConfirm('Discard this workout?', 'Discard')) && mutate((st) => { st.active = undefined; })}>Discard</button>
        <button className="btn primary" onClick={() => setFinishing(true)}>Finish</button>
      </div>

      <ExercisePicker open={adding} onClose={() => setAdding(false)} onPick={(id) => {
        upd((w) => { const last = exerciseHistory(getState(), id).at(-1); w.exercises.push({ exerciseId: id, sets: [{ reps: last?.sets[0]?.reps ?? 8, weight: last?.topWeight ?? 0, done: false }] }); });
        setAdding(false);
      }} />
      <CardioForm open={cardio} onClose={() => setCardio(false)} onSave={(c) => { upd((w) => { w.cardio.push(c); }); setCardio(false); }} />
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} onSaved={onSaved} elapsedMin={Math.max(1, Math.round(elapsed / 60))} />
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

function SavedSummary({ summary, onClose }: { summary: Summary; onClose: () => void }) {
  const s = useAppState();
  return (
    <Sheet open onClose={onClose} title="Workout saved 💪">
      <div className="grid3">
        <Stat v={fmtDuration(summary.session.durationMin)} l="duration" />
        <Stat v={fmt(sessionVolume(summary.session))} l="kg volume" />
        <Stat v={fmt(sessionKcal(summary.session, s.profile.weightKg))} l="≈ kcal burned" />
      </div>
      {summary.prs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h3>🏆 New personal records</h3>
          {summary.prs.map((p, i) => <div key={i} className="small">{exerciseName(s, p.exerciseId)} — {p.kind} {fmt(p.value, 1)} kg</div>)}
        </div>
      )}
      <button className="btn primary block" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
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
    <Sheet open={open} onClose={onClose} title="Finish workout">
      <div className="stack">
        <div><h3>How hard was the whole session?</h3><RpePicker value={rpe} onChange={setRpe} /></div>
        <NumField label="Duration" suffix="min" value={dur} onChange={setDur} />
        <label className="field"><span>Notes</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <p className="tiny muted">Only completed (✓) sets are saved.</p>
        <button className="btn primary block" onClick={save}>Save workout</button>
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
    <Sheet open={open} onClose={onClose} title={withRpe ? 'Log run / cardio' : 'Add cardio block'}>
      <div className="stack">
        <label className="field"><span>Activity</span>
          <select value={activity} onChange={(e) => setActivity(e.target.value as CardioActivity)}>{CARDIO.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        </label>
        <div className="grid2">
          <NumField label="Duration" suffix="min" value={dur} onChange={setDur} step={0.5} />
          {def.distance && <NumField label="Distance" suffix="km" value={dist} onChange={setDist} step={0.01} />}
          <NumField label="Avg heart rate" suffix="bpm" value={hr} onChange={setHr} />
          {def.distance && <NumField label="Elevation gain" suffix="m" value={elev} onChange={setElev} />}
        </div>
        {p && activity === 'run' && <p className="small muted">Pace {fmtPace(p)} · {fmt(60 / p, 1)} km/h</p>}
        {withRpe && (
          <>
            <div><h3>Effort (RPE)</h3><RpePicker value={rpe} onChange={setRpe} /></div>
            <label className="field"><span>Date</span><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field"><span>Notes</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          </>
        )}
        <button className="btn primary block" disabled={!dur} onClick={() => onSave({ activity, durationMin: dur!, distanceKm: def.distance ? dist : undefined, avgHr: hr, elevationM: def.distance ? elev : undefined }, { rpe, date, notes })}>Save</button>
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
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <div className="stack">
        <input autoFocus placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
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
            <button className="btn block" style={{ marginTop: 8 }} onClick={create}>Create “{q.trim()}”{muscle ? ` (${muscle})` : ''}</button>
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
      <p className="small muted">{prettyDate(x.date)} · {sessionKind(x)} · effort {x.rpe}/10 ({RPE_LABELS[x.rpe]})</p>
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
          <div className="tiny muted">{fmtDuration(c.durationMin)}{c.distanceKm ? ` · ${fmt(c.distanceKm, 2)} km · ${fmtPace(pace(c)!)}` : ''}{c.avgHr ? ` · avg ${c.avgHr} bpm` : ''}{c.elevationM ? ` · +${c.elevationM} m` : ''}</div>
        </div>
      ))}
      {x.notes && <p className="small" style={{ marginTop: 10 }}>📝 {x.notes}</p>}
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn danger" onClick={async () => { if (await askConfirm('Delete this session?', 'Delete')) { mutate((st) => { st.sessions = st.sessions.filter((y) => y.id !== x.id); }); onClose(); } }}>Delete</button>
        {x.exercises.length > 0 && <button className="btn grow" onClick={() => {
          mutate((st) => { st.templates.push({ id: 't-' + uid(), name: x.name + ' (copy)', exercises: x.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter((z) => !z.warmup).length, reps: e.sets.at(-1)?.reps ?? 8, restSec: e.restSec ?? 120 })) }); });
          onClose();
        }}>Save as template</button>}
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
      <Sheet open={!adding} onClose={onClose} title="Template">
        <div className="stack">
          <label className="field"><span>Name</span><input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></label>
          <div className="row tiny muted"><span className="grow">Exercise</span><span style={{ width: 56 }}>Sets</span><span style={{ width: 56 }}>Reps</span><span style={{ width: 64 }}>Rest s</span><span style={{ width: 30 }} /></div>
          {t.exercises.map((e, i) => (
            <div key={i} className="row">
              <span className="grow small">{exerciseName(s, e.exerciseId)}</span>
              <input style={{ width: 56, padding: 6 }} type="number" value={e.sets} onChange={(ev) => setEx(i, 'sets', +ev.target.value)} />
              <input style={{ width: 56, padding: 6 }} type="number" value={e.reps} onChange={(ev) => setEx(i, 'reps', +ev.target.value)} />
              <input style={{ width: 64, padding: 6 }} type="number" step={15} value={e.restSec} onChange={(ev) => setEx(i, 'restSec', +ev.target.value)} />
              <button className="icon-btn" style={{ width: 30 }} onClick={() => setT({ ...t, exercises: t.exercises.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn sm" onClick={() => setAdding(true)}>+ Exercise</button>
          <div className="row">
            {exists && <button className="btn danger" onClick={async () => { if (await askConfirm('Delete this template?', 'Delete')) { mutate((st) => { st.templates = st.templates.filter((x) => x.id !== t.id); }); onClose(); } }}>Delete</button>}
            <button className="btn primary grow" onClick={save} disabled={!t.name.trim()}>Save template</button>
          </div>
        </div>
      </Sheet>
      <ExercisePicker open={adding} onClose={() => setAdding(false)} onPick={(id) => { setT((x) => ({ ...x, exercises: [...x.exercises, { exerciseId: id, sets: 3, reps: 10, restSec: 90 }] })); setAdding(false); }} />
    </>
  );
}


