import type { GutLog, Severity } from '../types';
import { mutate, useAppState } from '../lib/storage';
import { readiness } from '../lib/readiness';
import { cycleInfo, addPeriodStart } from '../lib/cycle';
import { today } from '../lib/util';
import { Bar, Seg } from './ui';
import { tr } from '../i18n';

const LEVELS = ['Poor', 'OK', 'Good', 'Great'];
const SORE = ['None', 'Mild', 'Quite', 'Very'];

/** Merge answers into today's daily log without inventing gut-symptom answers. */
export function setToday(patch: Partial<GutLog>) {
  mutate((st) => {
    const d = today();
    const g = (st.gut ?? []).find((x) => x.date === d);
    if (g) Object.assign(g, patch);
    else st.gut = [...(st.gut ?? []), { date: d, bloating: 0, pain: 0, reflux: 0, wellnessOnly: true, ...patch }];
  });
}

function Q({ label, value, opts, onChange }: { label: string; value: Severity | undefined; opts: string[]; onChange: (v: Severity) => void }) {
  return (
    <div>
      <div className="tiny muted" style={{ marginBottom: 3 }}>{label}</div>
      <Seg value={value === undefined ? '' : String(value)} onChange={(v) => onChange(Number(v) as Severity)} options={opts.map((o, i) => ({ value: String(i), label: o }))} />
    </div>
  );
}

export function ReadinessCard({ onApply, compact }: { onApply?: () => void; compact?: boolean }) {
  const s = useAppState();
  const g = (s.gut ?? []).find((x) => x.date === today());
  const r = readiness(s);
  const c = cycleInfo(s);
  const tracking = s.profile.sex === 'female' && s.profile.cycle?.track;
  const color = r.level === 'high' ? 'var(--accent)' : r.level === 'normal' ? 'var(--protein)' : 'var(--warn)';
  const answered = g?.sleep !== undefined && g?.energy !== undefined && g?.soreness !== undefined;

  return (
    <div className="card" style={{ borderColor: color }}>
      <div className="row between">
        <div><div className="tiny muted">{tr("Readiness today")}</div><h2 style={{ margin: '2px 0' }}>{tr(r.title)}</h2></div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color }}>{r.score}</div>
      </div>
      <Bar value={r.score} max={100} color={color} />
      <p className="small" style={{ marginTop: 8 }}>{tr(r.advice)}</p>
      {r.reasons.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
          {r.reasons.map((x) => <span key={x.text} className={'pill ' + (x.delta < 0 ? 'warn' : 'accent')}>{tr(x.text)} {x.delta > 0 ? '+' : ''}{x.delta}</span>)}
        </div>
      )}
      {c && (
        <p className="tiny muted" style={{ marginTop: 8 }}>{tr("🌙 Cycle day")}{' '}{c.day}{c.hormonal ? '' : ` · ${tr(c.label)}`}. {c.note}</p>
      )}
      {(!answered || !compact) && (
        <details open={!answered} style={{ marginTop: 10 }}>
          <summary className="small" style={{ cursor: 'pointer' }}>{answered ? tr("Edit how you feel") : tr("How do you feel? (3 quick taps)")}</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <Q label={tr("Sleep last night")} value={g?.sleep} opts={LEVELS} onChange={(v) => setToday({ sleep: v })} />
            <Q label={tr("Energy")} value={g?.energy} opts={LEVELS} onChange={(v) => setToday({ energy: v })} />
            <Q label={tr("Muscle soreness")} value={g?.soreness} opts={SORE} onChange={(v) => setToday({ soreness: v })} />
            {tracking && (
              <>
                <Q label={tr("Cycle symptoms (cramps, PMS, headache)")} value={g?.cycleSymptoms} opts={['None', 'Mild', 'Moderate', 'Severe']} onChange={(v) => setToday({ cycleSymptoms: v })} />
                <label className="row small" style={{ gap: 8 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={!!g?.period}
                    onChange={(e) => { setToday({ period: e.target.checked }); if (e.target.checked && (!c || c.day > 10)) mutate(addPeriodStart(today())); }} />
                  {tr("On my period today")}
                </label>
              </>
            )}
          </div>
        </details>
      )}
      {onApply && <button className="btn sm block" style={{ marginTop: 10 }} onClick={onApply}>{tr("Update today’s weights to match")}</button>}
    </div>
  );
}
