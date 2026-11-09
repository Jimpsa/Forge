import { useMemo, useState } from 'react';
import { mutate, useAppState } from '../lib/storage';
import { buildProgram, MUSCLES, PRESETS, all, programTemplates, type Avoid, type Equip, type Goal, type Level, type Muscle, type Priority, type ProgramInputs } from '../data/programs';
import { programInfo } from '../lib/program';
import { celebrate } from '../lib/fx';
import { today, uid } from '../lib/util';
import { Bar, Seg, Sheet } from '../components/ui';
import { askConfirm } from '../components/confirm';
import { startWorkout } from './Train';
import { exerciseName } from '../lib/training';

const DEFAULTS: ProgramInputs = { goal: 'muscle', days: 3, minutes: 60, level: 'beginner', equipment: 'gym', pullupBar: true, avoid: [], priorities: all('normal'), seed: 0 };

export function ProgramCard({ onBuild }: { onBuild: () => void }) {
  const s = useAppState();
  const info = programInfo(s);
  const [view, setView] = useState(false);
  if (!info) {
    return (
      <div className="card" style={{ borderColor: 'var(--accent)' }}>
        <h2 style={{ marginBottom: 4 }}>Build my program</h2>
        <p className="small muted">Tell the app your goal, how often you can train, your equipment and which muscles to focus on. It designs a complete weekly program using established training principles.</p>
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={onBuild}>Design my program</button>
      </div>
    );
  }
  const { program, next, week, deload, templates, doneThisWeek } = info;
  return (
    <div className="card" style={{ borderColor: 'var(--accent)' }}>
      <div className="row between">
        <div><div className="tiny muted">Your program · week {week}{deload ? ' · deload week' : ''}</div><h2 style={{ margin: '2px 0' }}>{program.name}</h2></div>
        <span className="pill">{doneThisWeek}/{templates.length} this week</span>
      </div>
      {deload && <p className="small" style={{ color: 'var(--warn)', marginTop: 4 }}>Deload week: do about half the sets with lighter weights (RPE 6). You’ll come back stronger.</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary grow" onClick={() => startWorkout(next)}>Start {next.name.split(' · ')[0]}</button>
        <button className="btn" onClick={() => setView(true)}>View</button>
      </div>
      <p className="tiny muted" style={{ marginTop: 6 }}>Next: {next.name}</p>
      <Sheet open={view} onClose={() => setView(false)} title={program.name}>
        <p className="small muted">{program.summary} · {program.weekdays.join(', ')}</p>
        {templates.map((t) => (
          <div key={t.id} className="list-item" style={{ display: 'block' }}>
            <div className="row between"><strong className="small">{t.name}</strong><button className="btn sm" onClick={() => { setView(false); startWorkout(t); }}>Start</button></div>
            <div className="tiny muted">{t.exercises.map((e) => `${exerciseName(s, e.exerciseId)} ${e.sets}×${e.reps}`).join(' · ')}</div>
          </div>
        ))}
        <h3 style={{ marginTop: 14 }}>Why it’s built this way</h3>
        <ul className="small" style={{ paddingLeft: 18, marginTop: 4 }}>{program.notes.map((n) => <li key={n} style={{ marginTop: 4 }}>{n}</li>)}</ul>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn grow" onClick={() => { setView(false); onBuild(); }}>Build a new program</button>
          <button className="btn danger" onClick={async () => { if (await askConfirm('Remove this program? Your workout history is kept.', 'Remove')) { mutate((st) => { st.templates = st.templates.filter((t) => !program.templateIds.includes(t.id)); st.program = undefined; }); setView(false); } }}>Remove</button>
        </div>
      </Sheet>
    </div>
  );
}

export function ProgramBuilder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useAppState();
  const [inp, setInp] = useState<ProgramInputs>(() => ({ ...DEFAULTS, ...(s.program?.inputs as Partial<ProgramInputs> | undefined) }));
  const [preset, setPreset] = useState<string>('');
  const set = (p: Partial<ProgramInputs>) => setInp((x) => ({ ...x, ...p }));
  const program = useMemo(() => buildProgram(inp), [inp]);

  const save = () => {
    const pid = uid();
    const tpls = programTemplates(program, pid);
    mutate((st) => {
      const old = st.program?.templateIds ?? [];
      st.templates = [...tpls, ...st.templates.filter((t) => !old.includes(t.id))];
      st.program = { id: pid, name: program.name, summary: program.summary, createdAt: today(), inputs: inp, templateIds: tpls.map((t) => t.id), weekdays: program.days.map((d) => d.weekday), notes: program.notes, weekly: program.weekly };
    });
    celebrate(null, 70);
    onClose();
  };

  const chip = (on: boolean) => 'btn sm' + (on ? ' primary' : '');
  const maxWeekly = Math.max(20, ...Object.values(program.weekly));

  return (
    <Sheet open={open} onClose={onClose} title="Design my program">
      <div className="stack">
        <div>
          <div className="small" style={{ marginBottom: 6 }}>Quick start</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {PRESETS.map((p) => <button key={p.key} type="button" className={chip(preset === p.key)} onClick={() => { setPreset(p.key); set(p.apply(inp)); }}>{p.label}</button>)}
          </div>
        </div>

        <div><div className="small" style={{ marginBottom: 4 }}>Goal</div>
          <Seg value={inp.goal} onChange={(v: Goal) => set({ goal: v })} options={[{ value: 'muscle', label: 'Build muscle' }, { value: 'strength', label: 'Stronger' }, { value: 'toning', label: 'Toning' }, { value: 'general', label: 'Fitness' }]} /></div>

        <div className="grid2">
          <label className="field"><span>Days per week</span>
            <select value={inp.days} onChange={(e) => set({ days: +e.target.value })}>{[2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
          <label className="field"><span>Time per session</span>
            <select value={inp.minutes} onChange={(e) => set({ minutes: +e.target.value })}>{[30, 45, 60, 75, 90].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
        </div>

        <div><div className="small" style={{ marginBottom: 4 }}>Experience</div>
          <Seg value={inp.level} onChange={(v: Level) => set({ level: v })} options={[{ value: 'beginner', label: 'Under 1 year' }, { value: 'intermediate', label: '1–3 years' }, { value: 'advanced', label: '3+ years' }]} /></div>

        <div><div className="small" style={{ marginBottom: 4 }}>Equipment</div>
          <Seg value={inp.equipment} onChange={(v: Equip) => set({ equipment: v })} options={[{ value: 'gym', label: 'Gym' }, { value: 'home', label: 'Home dumbbells' }, { value: 'bodyweight', label: 'Bodyweight' }]} />
          {inp.equipment !== 'gym' && <label className="row small" style={{ gap: 8, marginTop: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={inp.pullupBar} onChange={(e) => set({ pullupBar: e.target.checked })} /> I have a pull-up bar</label>}
        </div>

        <div>
          <div className="small" style={{ marginBottom: 6 }}>Muscle priorities</div>
          {MUSCLES.map((m) => (
            <div key={m.key} className="row between" style={{ padding: '4px 0' }}>
              <span className="small" style={{ minWidth: 86 }}>{m.label}</span>
              <div style={{ flex: 1, maxWidth: 260 }}>
                <Seg value={inp.priorities[m.key]} onChange={(v: Priority) => { setPreset(''); set({ priorities: { ...inp.priorities, [m.key]: v } as Record<Muscle, Priority> }); }} options={[{ value: 'light', label: 'Light' }, { value: 'normal', label: 'Normal' }, { value: 'focus', label: 'Focus' }]} />
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="small" style={{ marginBottom: 6 }}>Go easy on (avoid exercises that load it)</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {([['lowerback', 'Lower back'], ['knees', 'Knees'], ['shoulders', 'Shoulders']] as [Avoid, string][]).map(([k, l]) => (
              <button key={k} type="button" className={chip(inp.avoid.includes(k))} onClick={() => set({ avoid: inp.avoid.includes(k) ? inp.avoid.filter((x) => x !== k) : [...inp.avoid, k] })}>{l}</button>
            ))}
          </div>
        </div>

        {/* ---------- Preview ---------- */}
        <div className="card" style={{ margin: 0, background: 'var(--bg)' }}>
          <div className="row between"><div><div className="tiny muted">Preview</div><h2 style={{ margin: 0 }}>{program.name}</h2></div><button className="btn sm" onClick={() => set({ seed: inp.seed + 1 })}>Shuffle exercises</button></div>
          <p className="tiny muted">{program.summary}</p>
          <h3 style={{ marginTop: 10 }}>Weekly sets per muscle</h3>
          {MUSCLES.filter((m) => program.weekly[m.key]).map((m) => (
            <div key={m.key} style={{ marginBottom: 6 }}>
              <div className="row between tiny"><span>{m.label} {inp.priorities[m.key] === 'focus' && <span className="pill accent">focus</span>}{inp.priorities[m.key] === 'light' && <span className="pill">light</span>}</span><span className="num muted">{program.weekly[m.key]} sets</span></div>
              <Bar value={program.weekly[m.key]} max={maxWeekly} color={inp.priorities[m.key] === 'focus' ? 'var(--accent)' : inp.priorities[m.key] === 'light' ? 'var(--muted)' : 'var(--protein)'} />
            </div>
          ))}
          {program.days.map((d) => (
            <div key={d.name} style={{ marginTop: 12 }}>
              <div className="row between"><strong className="small">{d.weekday} · {d.name}</strong><span className="tiny muted">~{d.minutes} min</span></div>
              {d.exercises.map((x, i) => (
                <div key={i} className="row small" style={{ padding: '3px 0', gap: 8 }}>
                  <span className="pill" style={{ minWidth: 26, textAlign: 'center', visibility: x.superset ? 'visible' : 'hidden' }}>{x.superset ?? '·'}</span>
                  <span className="grow">{x.name}</span>
                  <span className="num muted">{x.sets} × {x.repRange[0]}–{x.repRange[1]}</span>
                </div>
              ))}
            </div>
          ))}
          <h3 style={{ marginTop: 14 }}>Why it’s built this way</h3>
          <ul className="small" style={{ paddingLeft: 18, marginTop: 4 }}>{program.notes.map((n) => <li key={n} style={{ marginTop: 4 }}>{n}</li>)}</ul>
        </div>
        <button className="btn primary block" onClick={save}>Save program{s.program ? ' (replaces current)' : ''}</button>
        <p className="tiny muted">Saved as workout templates. Weights start from your history and the workout screen suggests when to add weight. You can still edit any day afterwards.</p>
      </div>
    </Sheet>
  );
}
