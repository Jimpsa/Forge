import { useState } from 'react';
import { mutate, useAppState } from '../lib/storage';
import { addPeriodStart, cycleInfo, periodStarts, phasePerformance } from '../lib/cycle';
import { prettyDate, shortDate, today } from '../lib/util';
import { Bar } from './ui';

export function CycleCard() {
  const s = useAppState();
  const [past, setPast] = useState('');
  if (s.profile.sex !== 'female' || !s.profile.cycle?.track) return null;
  const c = cycleInfo(s);
  const starts = periodStarts(s);
  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>🌙 Cycle</h2>
        {c && <span className="pill">{c.hormonal ? `Day ${c.day}` : `Day ${c.day} of ~${c.length}`}</span>}
      </div>
      {c ? (
        <>
          {!c.hormonal && <div style={{ margin: '10px 0 4px' }}><Bar value={c.day} max={c.length} color="#c58af9" /></div>}
          <p className="small" style={{ marginTop: 6 }}><strong>{c.label}.</strong> {c.note}</p>
          {!c.hormonal && <p className="tiny muted" style={{ marginTop: 4 }}>{c.estimated ? 'Period is later than your usual length — log it when it starts.' : `Next period expected in ~${c.nextIn} days.`}</p>}
        </>
      ) : <p className="small muted" style={{ marginTop: 6 }}>Log the first day of your last period to start.</p>}
      <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
        <button className="btn sm" onClick={() => mutate(addPeriodStart(today()))}>Period started today</button>
        <input type="date" max={today()} value={past} onChange={(e) => setPast(e.target.value)} style={{ width: 150, padding: '6px 8px' }} />
        <button className="btn sm" disabled={!past} onClick={() => { mutate(addPeriodStart(past)); setPast(''); }}>Add past start</button>
      </div>
      {starts.length > 0 && <p className="tiny muted" style={{ marginTop: 6 }}>Logged starts: {starts.slice(-4).map(shortDate).join(', ')}</p>}
    </div>
  );
}

export function CyclePattern() {
  const s = useAppState();
  if (s.profile.sex !== 'female' || !s.profile.cycle?.track) return null;
  const rows = phasePerformance(s);
  return (
    <div className="card">
      <h2>Your strength across your cycle</h2>
      {rows.length < 2 ? (
        <p className="small muted">After about 2 cycles of logged periods and strength sessions, this shows how <em>your</em> lifts compare by phase. Research shows the effect is small and different for everyone — so your own data beats general rules.</p>
      ) : (
        <>
          {rows.map((r) => (
            <div key={r.phase} style={{ marginBottom: 8 }}>
              <div className="row between small"><span>{r.label} <span className="tiny muted">({r.n} sessions)</span></span><span className="num">{r.perf!.toFixed(1)}% · effort {r.rpe!.toFixed(1)}</span></div>
              <Bar value={r.perf! - 85} max={20} color="#c58af9" />
            </div>
          ))}
          <p className="tiny muted">100% = your usual estimated max. Differences under ~3% are normal day-to-day noise. Last updated {prettyDate(today())}.</p>
        </>
      )}
    </div>
  );
}
