import { trs } from '../i18n';
import { useMemo, useState } from 'react';
import { Area, Bar as RBar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { mutate, useAppState } from '../lib/storage';
import { dailyTargets, isTrainingDay, totalsFor } from '../lib/nutrition';
import { allExercises, exerciseHistory, weeklySummaries } from '../lib/training';
import { addDays, fmt, shortDate, today } from '../lib/util';
import { chartTheme, EmptyState, NumField, Seg, Stat } from '../components/ui';
import { CyclePattern } from '../components/Cycle';
import { BadgesGrid, RecapCard, StreakCard, StrengthLevels } from '../components/Rewards';
import { tr } from '../i18n';

export function Progress() {
  const [tab, setTab] = useState<'awards' | 'body' | 'strength' | 'effort' | 'diet'>('awards');
  return (
    <div>
      <div className="page-head"><h1>{tr("Progress")}</h1></div>
      <div style={{ marginBottom: 14 }}>
        <Seg value={tab} onChange={setTab} options={[{ value: 'awards', label: tr("Awards") }, { value: 'body', label: tr("Body") }, { value: 'strength', label: tr("Strength") }, { value: 'effort', label: tr("Effort") }, { value: 'diet', label: tr("Diet") }]} />
      </div>
      {tab === 'awards' && <><BadgesGrid /><StrengthLevels /><StreakCard /><RecapCard /></>}
      {tab === 'body' && <BodyTab />}
      {tab === 'strength' && <StrengthTab />}
      {tab === 'effort' && <EffortTab />}
      {tab === 'diet' && <DietTab />}
    </div>
  );
}

function BodyTab() {
  const s = useAppState();
  const existing = s.body.find((b) => b.date === today());
  const [w, setW] = useState<number | undefined>(existing?.weightKg ?? s.profile.weightKg);
  const [bf, setBf] = useState<number | undefined>(existing?.bodyFatPct);
  const [waist, setWaist] = useState<number | undefined>(existing?.waistCm);
  const sorted = [...s.body].sort((a, b) => a.date.localeCompare(b.date));
  const data = sorted.filter((b) => b.weightKg).map((b, i, arr) => {
    const win = arr.filter((x) => x.date > addDays(b.date, -7) && x.date <= b.date);
    return { date: shortDate(b.date), weight: b.weightKg, avg: win.reduce((a, x) => a + x.weightKg!, 0) / win.length, i };
  });
  const first = data[0]?.avg, last = data.at(-1)?.avg;

  const save = () => mutate((st) => {
    const e = st.body.find((b) => b.date === today());
    const v = { date: today(), weightKg: w, bodyFatPct: bf, waistCm: waist };
    if (e) Object.assign(e, v); else st.body.push(v);
    if (w) st.profile.weightKg = w; // keeps calorie & protein targets in sync with current weight
  });

  return (
    <>
      <div className="card">
        <h2>{tr("Log today")}</h2>
        <div className="grid3">
          <NumField label={tr("Weight")} suffix="kg" value={w} onChange={setW} step={0.1} />
          <NumField label={tr("Body fat")} suffix="%" value={bf} onChange={setBf} step={0.1} />
          <NumField label={tr("Waist")} suffix="cm" value={waist} onChange={setWaist} step={0.5} />
        </div>
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={save}>{trs(existing ? tr("Update") : tr("Save"))}</button>
      </div>
      <div className="card">
        <h2>{tr("Weight trend")}</h2>
        {data.length < 2 ? <div className="empty">{tr("Log your weight a few times to see the trend. Weigh in the morning for the most consistent numbers.")}</div> : (
          <>
            <div className="grid3" style={{ marginBottom: 10 }}>
              <Stat v={tr("{v0} kg", { v0: fmt(last, 1) })} l="7-day average" />
              <Stat v={tr("{v0}{v1} kg", { v0: last! - first! > 0 ? '+' : '', v1: fmt(last! - first!, 1) })} l="change" />
              <Stat v={data.length} l="weigh-ins" />
            </div>
            <div className="chart">
              <ResponsiveContainer>
                <LineChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis dataKey="date" {...chartTheme.axis} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} {...chartTheme.axis} tickFormatter={(v) => fmt(v, 0)} />
                  <Tooltip {...chartTheme.tooltip} formatter={(v) => `${fmt(Number(v), 1)} kg`} />
                  <Line dataKey="weight" name={tr("Weigh-in")} stroke="#8b93a7" strokeWidth={0} dot={{ r: 3, fill: '#8b93a7' }} isAnimationActive={false} />
                  <Line dataKey="avg" name="7-day avg" stroke="#7cf29c" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function StrengthTab() {
  const s = useAppState();
  const trained = useMemo(() => allExercises(s).filter((e) => s.sessions.some((x) => x.exercises.some((y) => y.exerciseId === e.id))), [s]);
  const [ex, setEx] = useState<string>('');
  const id = ex || trained[0]?.id;
  if (!trained.length) return <div className="card"><EmptyState kind="chart" title={tr("No strength data yet")} text={tr("Finish a strength workout and your estimated max, best sets and volume show up here.")} /></div>;
  const hist = exerciseHistory(s, id);
  const data = hist.map((h) => ({ date: shortDate(h.date), e1rm: +h.e1rm.toFixed(1), top: h.topWeight, volume: h.volume }));
  const best = Math.max(...hist.map((h) => h.e1rm));
  return (
    <>
      <div className="card">
        <label className="field"><span>{tr("Exercise")}</span>
          <select value={id} onChange={(e) => setEx(e.target.value)}>{trained.map((e) => <option key={e.id} value={e.id}>{trs(e.name)}</option>)}</select>
        </label>
        <div className="grid3" style={{ margin: '12px 0' }}>
          <Stat v={tr("{v0} kg", { v0: fmt(best, 1) })} l="best est. 1RM" />
          <Stat v={tr("{v0} kg", { v0: fmt(Math.max(...hist.map((h) => h.topWeight)), 1) })} l="heaviest set" />
          <Stat v={hist.length} l="sessions" />
        </div>
        <div className="chart">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="date" {...chartTheme.axis} />
              <YAxis yAxisId="w" {...chartTheme.axis} />
              <YAxis yAxisId="v" orientation="right" hide />
              <Tooltip {...chartTheme.tooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <RBar yAxisId="v" dataKey="volume" name={tr("Volume (kg)")} fill="#2a3a4f" isAnimationActive={false} />
              <Line yAxisId="w" dataKey="e1rm" name={tr("Est. 1RM")} stroke="#7cf29c" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              <Line yAxisId="w" dataKey="top" name={tr("Top set")} stroke="#6cb6ff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="tiny muted">{tr("Estimated 1RM uses the Epley formula on sets of 12 reps or fewer.")}</p>
      </div>
      <div className="card">
        <h2>{tr("Personal bests")}</h2>
        {trained.map((e) => {
          const h = exerciseHistory(s, e.id);
          return (
            <div key={e.id} className="list-item">
              <span className="grow small">{trs(e.name)}</span>
              <span className="num small">{fmt(Math.max(...h.map((x) => x.e1rm)), 1)}{' '}{tr("kg")}{' '}<span className="muted tiny">{tr("e1RM")}</span></span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function EffortTab() {
  const s = useAppState();
  const weeks = weeklySummaries(s, 12).map((w) => ({ ...w, label: shortDate(w.week), avgRpe: w.sessions ? +w.avgRpe.toFixed(1) : null }));
  const active = weeks.filter((w) => w.sessions);
  const avg = (k: 'load' | 'sessions' | 'minutes' | 'runKm') => (active.length ? active.reduce((a, w) => a + w[k], 0) / active.length : 0);
  return (
    <>
      <div className="card">
        <h2>{tr("Weekly training load")}</h2>
        <p className="tiny muted" style={{ marginBottom: 10 }}>{tr("Load = session effort (1–10) × minutes. One number for lifting, running and mixed days, so you can compare them.")}</p>
        <div className="chart">
          <ResponsiveContainer>
            <ComposedChart data={weeks} margin={{ left: -20, right: -10, top: 8 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="label" {...chartTheme.axis} />
              <YAxis yAxisId="l" {...chartTheme.axis} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 10]} {...chartTheme.axis} />
              <Tooltip {...chartTheme.tooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <RBar yAxisId="l" dataKey="load" name={tr("Load")} fill="#7cf29c" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="r" dataKey="avgRpe" name={tr("Avg effort")} stroke="#f5c35b" strokeWidth={2} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h2>{tr("Averages (active weeks, last 12)")}</h2>
        <div className="grid4">
          <Stat v={fmt(avg('sessions'), 1)} l="sessions / week" />
          <Stat v={fmt(avg('load'))} l="load / week" />
          <Stat v={fmt(avg('minutes'))} l="minutes / week" />
          <Stat v={fmt(avg('runKm'), 1)} l="km run / week" />
        </div>
      </div>
      <CyclePattern />
      <div className="card">
        <h2>{tr("Session mix")}</h2>
        <div className="chart" style={{ height: 180 }}>
          <ResponsiveContainer>
            <ComposedChart data={weeks} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="label" {...chartTheme.axis} />
              <YAxis allowDecimals={false} {...chartTheme.axis} />
              <Tooltip {...chartTheme.tooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <RBar dataKey="strength" stackId="a" name={tr("Strength")} fill="#7cf29c" isAnimationActive={false} />
              <RBar dataKey="cardio" stackId="a" name={tr("Cardio")} fill="#6cb6ff" isAnimationActive={false} />
              <RBar dataKey="mixed" stackId="a" name={tr("Mixed")} fill="#f5c35b" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

function DietTab() {
  const s = useAppState();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
  const data = days.map((d) => {
    const n = totalsFor(s, d);
    const t = dailyTargets(s.profile, isTrainingDay(s, d));
    return { date: shortDate(d), kcal: Math.round(n.kcal ?? 0), target: t.kcal, protein: Math.round(n.protein ?? 0), proteinTarget: t.protein, logged: (n.kcal ?? 0) > 0 };
  });
  const logged = data.filter((d) => d.logged);
  const avg = (k: 'kcal' | 'protein' | 'target') => (logged.length ? logged.reduce((a, d) => a + d[k], 0) / logged.length : 0);
  return (
    <>
      <div className="card">
        <h2>{tr("Calories — last 14 days")}</h2>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <Stat v={fmt(avg('kcal'))} l="avg kcal (logged days)" />
          <Stat v={fmt(avg('protein'))} l="avg protein g" />
          <Stat v={`${logged.length}/14`} l="days logged" />
        </div>
        <div className="chart">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ left: -15, right: 8, top: 8 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="date" {...chartTheme.axis} />
              <YAxis {...chartTheme.axis} />
              <Tooltip {...chartTheme.tooltip} />
              <RBar dataKey="kcal" name={tr("Eaten")} fill="#7cf29c" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line dataKey="target" name={tr("Target")} stroke="#8b93a7" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h2>{tr("Protein — last 14 days")}</h2>
        <div className="chart" style={{ height: 180 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ left: -15, right: 8, top: 8 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="date" {...chartTheme.axis} />
              <YAxis {...chartTheme.axis} />
              <Tooltip {...chartTheme.tooltip} />
              <Area dataKey="protein" name={tr("Protein g")} fill="rgba(108,182,255,.25)" stroke="#6cb6ff" isAnimationActive={false} />
              <Line dataKey="proteinTarget" name={tr("Target")} stroke="#8b93a7" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
