import { trs } from '../i18n';
import { useState } from 'react';
import { mutate, useAppState } from '../lib/storage';
import { addPeriodStart, cycleInfo, periodStarts, phasePerformance } from '../lib/cycle';
import { prettyDate, shortDate, today } from '../lib/util';
import { Bar } from './ui';
import { tr } from '../i18n';

export function CycleCard() {
  const s = useAppState();
  const [past, setPast] = useState('');
  if (s.profile.sex !== 'female' || !s.profile.cycle?.track) return null;
  const c = cycleInfo(s);
  const starts = periodStarts(s);
  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{tr("🌙 Cycle")}</h2>
        {c && <span className="pill">{trs(c.hormonal ? tr("Day {v0}", { v0: c.day }) : tr("Day {v0} of ~{v1}", { v0: c.day, v1: c.length }))}</span>}
      </div>
      {c ? (
        <>
          {!c.hormonal && <div style={{ margin: '10px 0 4px' }}><Bar value={c.day} max={c.length} color="#c58af9" /></div>}
          <p className="small" style={{ marginTop: 6 }}><strong>{tr(c.label)}.</strong> {trs(c.note)}</p>
          {!c.hormonal && <p className="tiny muted" style={{ marginTop: 4 }}>{trs(c.estimated ? tr("Period is later than your usual length — log it when it starts.") : tr("Next period expected in ~{v0} days.", { v0: c.nextIn }))}</p>}
        </>
      ) : <p className="small muted" style={{ marginTop: 6 }}>{tr("Log the first day of your last period to start.")}</p>}
      <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
        <button className="btn sm" onClick={() => mutate(addPeriodStart(today()))}>{tr("Period started today")}</button>
        <input type="date" max={today()} value={past} onChange={(e) => setPast(e.target.value)} style={{ width: 150, padding: '6px 8px' }} />
        <button className="btn sm" disabled={!past} onClick={() => { mutate(addPeriodStart(past)); setPast(''); }}>{tr("Add past start")}</button>
      </div>
      {starts.length > 0 && <p className="tiny muted" style={{ marginTop: 6 }}>{tr("Logged starts:")}{' '}{trs(starts.slice(-4).map(shortDate).join(', '))}</p>}
    </div>
  );
}

export function CyclePattern() {
  const s = useAppState();
  if (s.profile.sex !== 'female' || !s.profile.cycle?.track) return null;
  const rows = phasePerformance(s);
  return (
    <div className="card">
      <h2>{tr("Your strength across your cycle")}</h2>
      {rows.length < 2 ? (
        <p className="small muted">{tr("After about 2 cycles of logged periods and strength sessions, this shows how")}{' '}<em>{tr("your")}</em>{' '}{tr("lifts compare by phase. Research shows the effect is small and different for everyone — so your own data beats general rules.")}</p>
      ) : (
        <>
          {rows.map((r) => (
            <div key={r.phase} style={{ marginBottom: 8 }}>
              <div className="row between small"><span>{tr(r.label)} <span className="tiny muted">({r.n}{' '}{tr("sessions)")}</span></span><span className="num">{trs(r.perf!.toFixed(1))}{tr("% · effort")}{' '}{trs(r.rpe!.toFixed(1))}</span></div>
              <Bar value={r.perf! - 85} max={20} color="#c58af9" />
            </div>
          ))}
          <p className="tiny muted">{tr("100% = your usual estimated max. Differences under ~3% are normal day-to-day noise. Last updated")}{' '}{prettyDate(today())}.</p>
        </>
      )}
    </div>
  );
}
