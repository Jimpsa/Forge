import { trs } from '../i18n';
import { useAppState } from '../lib/storage';
import { loadRatio, sessionKcal, sessionKind, weeklySummaries } from '../lib/training';
import { fmt, fmtDuration, today } from '../lib/util';
import { MacroSummary, WaterCard } from './Diet';
import { startWorkout } from './Train';
import { Stat } from '../components/ui';
import { ReadinessCard } from '../components/Readiness';
import { CycleCard } from '../components/Cycle';
import { RecapCard, RingsCard, StreakCard } from '../components/Rewards';
import { programInfo } from '../lib/program';
import { PrepCard } from '../components/Prep';
import type { Tab } from '../App';
import { tr } from '../i18n';
import { locale } from '../i18n';

export function Today({ go }: { go: (t: Tab) => void }) {
  const s = useAppState();
  const t = today();
  const todays = s.sessions.filter((x) => x.date === t);
  const week = weeklySummaries(s, 1)[0];
  const ratio = loadRatio(s);
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const burned = todays.reduce((a, x) => a + sessionKcal(x, s.profile.weightKg), 0);
  // Suggest the template that was used least recently.
  // With a program: its next day. Otherwise: the template used least recently.
  const next = programInfo(s)?.next ?? [...s.templates].sort((a, b) => {
    const last = (n: string) => Math.max(0, ...s.sessions.filter((x) => x.name === n).map((x) => x.startedAt));
    return last(a.name) - last(b.name);
  })[0];

  return (
    <div>
      <div className="page-head">
        <div><h1>{tr(greet)}{trs(s.profile.name ? `, ${s.profile.name}` : '')}</h1><p className="muted small">{trs(new Date().toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' }))}</p></div>
      </div>

      <div className="card" onClick={() => go('diet')} style={{ cursor: 'pointer' }}>
        <div className="row between" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>{tr("Nutrition")}</h2><span className="muted small">{tr("Log food ›")}</span></div>
        <MacroSummary date={t} />
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>{tr("Training")}</h2><span className="muted small click" style={{ cursor: 'pointer' }} onClick={() => go('train')}>{tr("Open ›")}</span></div>
        {s.active ? (
          <button className="btn primary block" onClick={() => go('train')}>{tr("Continue “")}{trs(s.active.name)}”</button>
        ) : todays.length ? (
          <>
            {todays.map((x) => <div key={x.id} className="small">✅ {trs(x.name)} <span className="pill">{trs(sessionKind(x))}</span> <span className="muted">{fmtDuration(x.durationMin)}{' '}{tr("· effort")}{' '}{x.rpe}/10</span></div>)}
            <p className="tiny muted" style={{ marginTop: 6 }}>≈ {fmt(burned)}{' '}{tr("kcal burned in training")}</p>
          </>
        ) : (
          <div className="grid2">
            {next && <button className="btn primary" onClick={() => { startWorkout(next); go('train'); }}>{tr("Start")}{' '}{trs(next.name.split(' · ')[0])}</button>}
            <button className="btn" onClick={() => go('train')}>{tr("Other workout")}</button>
          </div>
        )}
      </div>

      {!todays.length && <ReadinessCard compact />}
      <PrepCard />
      <RingsCard onOpen={() => go('diet')} />
      <RecapCard dismissible />
      <StreakCard />
      <CycleCard />

      <div className="card" onClick={() => go('progress')} style={{ cursor: 'pointer' }}>
        <h2>{tr("This week")}</h2>
        <div className="grid4">
          <Stat v={week.sessions} l="sessions" />
          <Stat v={week.sessions ? fmt(week.avgRpe, 1) : '–'} l="avg effort" />
          <Stat v={fmt(week.volume / 1000, 1) + ' t'} l="lifted" />
          <Stat v={fmt(week.runKm, 1)} l="km run" />
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>{trs(ratio.status)}</p>
      </div>

      <WaterCard date={t} />
    </div>
  );
}
