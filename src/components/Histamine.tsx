import { useMemo, useState } from 'react';
import { mutate, useAppState } from '../lib/storage';
import { settingsOf } from '../lib/settings';
import { HISTAMINE_GUIDE, histamineBucket, histamineOf, HIST_SYMPTOMS } from '../data/histamine';
import { Md } from './Markdown';
import { Sheet } from './ui';
import { shortDate } from '../lib/util';

export const useHistamine = () => !!settingsOf(useAppState()).histamine;
export const setHistamine = (on: boolean) => mutate((st) => { st.settings = { ...settingsOf(st), histamine: on }; });

/** Small badge for a food's histamine rating (only shown in histamine-aware mode). */
export function HistBadge({ name, full }: { name: string; full?: boolean }) {
  const on = useHistamine();
  if (!on) return null;
  const r = histamineOf(name);
  if (r.level === 'low' && !r.liberator && !r.daoBlocker) return full ? <span className="pill" title="Low histamine when fresh">low histamine</span> : null;
  const label = [r.level !== 'low' ? `${r.level} histamine` : '', r.liberator ? 'liberator' : '', r.daoBlocker ? 'DAO blocker' : ''].filter(Boolean).join(' · ');
  return <span className={'pill ' + (r.level === 'high' || r.daoBlocker ? 'warn' : '')} title={r.note}>{label}</span>;
}

export function HistNote({ name }: { name: string }) {
  const on = useHistamine();
  if (!on) return null;
  const r = histamineOf(name);
  if (!r.note) return null;
  return <p className="tiny muted" style={{ margin: 0 }}>Histamine: {r.note}</p>;
}

export function GuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Sheet open onClose={onClose} title="Histamine guide"><div className="small legal-text"><Md text={HISTAMINE_GUIDE.replace(/^# .*\n/, '')} /></div></Sheet>;
}

/** Chips for histamine-type symptoms in the daily check-in. */
export function HistSymptomChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <div className="small" style={{ marginBottom: 4 }}>Histamine-type symptoms today</div>
      <div className="row wrap" style={{ gap: 6 }}>
        {HIST_SYMPTOMS.map((x) => {
          const on = value.includes(x.key);
          return <button key={x.key} type="button" className={'btn sm' + (on ? ' primary' : '')} aria-pressed={on} onClick={() => onChange(on ? value.filter((k) => k !== x.key) : [...value, x.key])}>{x.label}</button>;
        })}
      </div>
    </div>
  );
}

/** Coach → Gut: histamine-aware mode, the "bucket" chart and the guide. */
export function HistamineCard({ ask }: { ask: (q: string) => void }) {
  const s = useAppState();
  const on = !!settingsOf(s).histamine;
  const [guide, setGuide] = useState(false);
  const b = useMemo(() => histamineBucket(s, 21), [s]);
  if (!on) {
    return (
      <div className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>Histamine-aware mode</h2><span className="switch"><input type="checkbox" aria-label="Histamine-aware mode" checked={false} onChange={() => setHistamine(true)} /><span /></span></div>
        <p className="small muted" style={{ marginTop: 6 }}>For people who react to histamine (flushing, itching, eczema flares, headaches, blocked nose, gut symptoms after aged, fermented or leftover foods). Turns on histamine ratings for foods, a low-histamine meal planner, histamine symptoms in the check-in and a daily “histamine bucket”. Leave it off if this doesn’t apply to you.</p>
        <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setGuide(true)}>Read the histamine guide</button>
        <GuideSheet open={guide} onClose={() => setGuide(false)} />
      </div>
    );
  }
  const max = Math.max(6, ...b.rows.map((r) => r.load));
  const todayRow = b.rows[b.rows.length - 1];
  return (
    <div className="card" style={{ borderColor: 'var(--accent-2)' }}>
      <div className="row between"><h2 style={{ margin: 0 }}>Histamine bucket</h2><span className="switch"><input type="checkbox" aria-label="Histamine-aware mode" checked onChange={() => setHistamine(false)} /><span /></span></div>
      <p className="tiny muted" style={{ marginTop: 4 }}>Estimated histamine load from what you logged (bars) and your symptoms (dots: skin, histamine-type and gut symptoms). Freshness isn’t visible to the app, so leftovers count for more than shown.</p>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${b.rows.length}, 1fr)`, gap: 3, alignItems: 'end', height: 110, marginTop: 10, position: 'relative' }} role="img" aria-label="Daily histamine load and symptoms, last 3 weeks">
        {b.threshold !== undefined && <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(b.threshold / max) * 100}%`, borderTop: '1px dashed var(--danger)' }} />}
        {b.rows.map((r) => (
          <div key={r.date} title={`${shortDate(r.date)}: load ${r.load}${r.symptoms !== undefined ? `, symptoms ${r.symptoms}` : ''}${r.top.length ? ` (${r.top.join(', ')})` : ''}`} style={{ display: 'grid', alignItems: 'end', height: '100%', position: 'relative' }}>
            <div style={{ height: `${Math.max(2, (r.load / max) * 100)}%`, borderRadius: 4, background: r.logged ? (b.threshold !== undefined && r.load > b.threshold ? 'var(--danger)' : 'var(--accent)') : 'var(--surface-2)' }} />
            {r.symptoms !== undefined && <div style={{ position: 'absolute', left: '50%', bottom: `${Math.min(95, (r.symptoms / 8) * 100)}%`, width: 7, height: 7, marginLeft: -3.5, borderRadius: 7, background: 'var(--protein)', border: '1px solid var(--surface)' }} />}
          </div>
        ))}
      </div>
      <div className="row between tiny muted" style={{ marginTop: 4 }}><span>{shortDate(b.rows[0].date)}</span><span>today</span></div>
      <p className="small" style={{ marginTop: 8 }}>
        Today: load <strong>{todayRow.load}</strong>{todayRow.top.length ? ` (mostly ${todayRow.top.map((n) => n.split(',')[0].toLowerCase()).join(', ')})` : ''}.{' '}
        {b.threshold !== undefined ? <>Your symptoms tend to rise above a load of about <strong>{b.threshold}</strong> (dashed line). Spread higher-histamine foods over the week to stay under it.</> : <span className="muted">After ~10 days of food logs and check-ins, the app estimates your personal threshold ({b.checkins}/10 so far).</span>}
      </p>
      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn sm" onClick={() => setGuide(true)}>Histamine guide</button>
        <button className="btn sm" onClick={() => ask('Look at my histamine bucket, check-ins and food log. What is most likely filling my bucket, and what should I change or test first?')}>Ask the coach</button>
      </div>
      <GuideSheet open={guide} onClose={() => setGuide(false)} />
    </div>
  );
}
