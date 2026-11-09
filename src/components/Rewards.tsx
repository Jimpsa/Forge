import { useEffect, useMemo, useState } from 'react';
import { Share } from '@capacitor/share';
import { Check, Snowflake } from 'lucide-react';
import { mutate, useAppState } from '../lib/storage';
import { badges, loggingStreak, perfectDay, strengthLevels, weeklyRecap, LEVELS } from '../lib/achievements';
import { haptic, replay } from '../lib/fx';
import { IS_NATIVE } from '../lib/app';
import { fmt } from '../lib/util';
import { FlameArt, Icon } from './Icon';

// ---------------- Today's rings ----------------

export function RingsCard({ onOpen }: { onOpen?: () => void }) {
  const s = useAppState();
  const p = perfectDay(s);
  const rings = [
    { r: 56, v: p.calories, c: p.over ? 'var(--warn)' : 'var(--accent)', label: p.over ? 'Calories (over target)' : 'Calories in target zone' },
    { r: 42, v: p.protein, c: 'var(--protein)', label: 'Protein goal' },
    { r: 28, v: p.water, c: 'var(--water)', label: 'Water goal' },
  ];
  return (
    <div className="card" onClick={onOpen} style={{ cursor: onOpen ? 'pointer' : undefined }}>
      <div className="row" style={{ gap: 16 }}>
        <svg width="118" height="118" viewBox="0 0 130 130" role="img" aria-label="Today's rings" style={{ transform: 'rotate(-90deg)', flex: 'none' }}>
          {rings.map((x) => <circle key={x.r} cx="65" cy="65" r={x.r} fill="none" stroke="var(--surface-2)" strokeWidth="11" />)}
          {rings.map((x) => { const c = 2 * Math.PI * x.r; return <circle key={'a' + x.r} className="arc" cx="65" cy="65" r={x.r} fill="none" stroke={x.c} strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - x.v)} />; })}
        </svg>
        <div className="grow stack">
          <div className="row between"><h2 style={{ margin: 0 }}>Today’s rings</h2>{p.perfect && <span className="gradient-text pop" style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>Perfect day ✨</span>}</div>
          {rings.map((x) => <div key={x.r} className="row small" style={{ gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 9, background: x.c, flex: 'none' }} /><span className="grow">{x.label}</span><span className="num muted">{Math.round(x.v * 100)}%</span></div>)}
          <div className="row small" style={{ gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 9, background: p.checkIn ? 'var(--good)' : 'var(--surface-2)', flex: 'none' }} /><span className="grow">Daily check-in</span><span className="muted">{p.checkIn ? <Check size={14} /> : '–'}</span></div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Streak ----------------

export function StreakCard() {
  const s = useAppState();
  const st = useMemo(() => loggingStreak(s), [s]);
  if (st.count === 0 && !s.entries.length) return null;
  return (
    <div className="card">
      <div className="row" style={{ gap: 12 }}>
        <FlameArt />
        <div className="grow">
          <div className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', lineHeight: 1.1 }}>{st.count} day{st.count === 1 ? '' : 's'}</div>
          <div className="small muted">logging streak · {st.freezesLeft} freeze{st.freezesLeft === 1 ? '' : 's'} left this month</div>
        </div>
      </div>
      <div className="week-dots" style={{ marginTop: 12 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
        {st.week.map((d) => (
          <div key={d.date} className={'wd ' + d.state + (d.today ? ' today' : '')} title={d.state}>
            {d.state === 'log' ? <Check size={14} strokeWidth={3} /> : d.state === 'freeze' ? <Snowflake size={14} /> : d.state === 'miss' ? '·' : ''}
          </div>
        ))}
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>A missed day is covered by a freeze ❄ (2 per month), so one busy day doesn’t reset your streak.</p>
    </div>
  );
}

// ---------------- Weekly recap ----------------

export async function shareText(title: string, text: string) {
  try {
    if (IS_NATIVE) await Share.share({ title, text, dialogTitle: title });
    else if (navigator.share) await navigator.share({ title, text });
    else { await navigator.clipboard.writeText(text); return 'copied'; }
    return 'shared';
  } catch { try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; } }
}

export function RecapCard({ dismissible }: { dismissible?: boolean }) {
  const s = useAppState();
  const r = useMemo(() => weeklyRecap(s), [s]);
  const [msg, setMsg] = useState('');
  if (!r.hasData) return null;
  if (dismissible && s.celebrated?.recapSeen === r.weekStart) return null;
  const showTrend = r.trend !== undefined && s.profile.goal !== 'maintain';
  const text = [`My Forge week (${r.label})`, `💪 ${r.workouts} workouts · ${fmt(r.tonnes, 1)} t lifted`, r.prs ? `🏆 ${r.prs} new PR${r.prs > 1 ? 's' : ''}` : '', r.bestLift ? `Best lift: ${r.bestLift.name} ${r.bestLift.text}` : '', `📒 ${r.daysLogged}/7 days logged`].filter(Boolean).join('\n');
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="recap">
        <div className="row between"><strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>Your week · {r.label}</strong><span className="tiny" style={{ fontWeight: 800, letterSpacing: '.08em' }}>FORGE</span></div>
        <div className="grid3">
          <div><div className="v num">{r.workouts}</div><div className="l">workouts</div></div>
          <div><div className="v num">{fmt(r.tonnes, 1)} t</div><div className="l">lifted</div></div>
          <div><div className="v num">{r.prs}</div><div className="l">new PRs</div></div>
          <div><div className="v num">{r.workouts ? r.avgRpe.toFixed(1) : '–'}</div><div className="l">avg effort</div></div>
          <div><div className="v num">{r.daysLogged}/7</div><div className="l">days logged</div></div>
          <div><div className="v num">{showTrend ? (Math.abs(r.trend!) < 0.05 ? '0.0' : `${r.trend! > 0 ? '+' : ''}${r.trend!.toFixed(1)}`) : '–'}</div><div className="l">{showTrend ? 'kg / week' : 'trend'}</div></div>
        </div>
        {r.bestLift && <div className="tiny" style={{ fontWeight: 700 }}>Best lift: {r.bestLift.name} {r.bestLift.text}</div>}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn grow" onClick={async () => { const res = await shareText('My Forge week', text); setMsg(res === 'copied' ? 'Copied — paste it anywhere' : res === 'shared' ? 'Shared!' : ''); }}>Share with friends</button>
        {dismissible && <button className="btn ghost" onClick={() => mutate((st) => { st.celebrated = { ...st.celebrated, recapSeen: r.weekStart }; })}>Hide</button>}
      </div>
      {msg && <p className="tiny muted" style={{ marginTop: 6 }}>{msg}</p>}
    </div>
  );
}

// ---------------- Badges ----------------

export function BadgesGrid() {
  const s = useAppState();
  const list = useMemo(() => badges(s), [s]);
  const [open, setOpen] = useState<string | null>(null);
  const earned = list.filter((b) => b.progress >= 1);
  const sel = list.find((b) => b.id === open);
  return (
    <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>Badges</h2><span className="pill">{earned.length} / {list.length}</span></div>
      <div className="badges" style={{ marginTop: 12 }}>
        {[...earned, ...list.filter((b) => b.progress < 1).sort((a, b) => b.progress - a.progress)].map((b) => (
          <button key={b.id} type="button" className={'badge' + (b.progress >= 1 ? '' : ' locked')} aria-label={`${b.name}: ${b.progress >= 1 ? 'earned' : b.label}`}
            onClick={(e) => { setOpen(b.id); if (b.progress >= 1) { replay(e.currentTarget, 'tap'); haptic('tick'); } }}>
            <span className="medal"><Icon name={b.icon} size={24} /></span>
            <span>{b.name}</span>
            {b.progress < 1 && <span className="prog"><i style={{ width: `${b.progress * 100}%` }} /></span>}
          </button>
        ))}
      </div>
      {sel && (
        <p className="small" style={{ marginTop: 12 }}>
          <strong>{sel.name}:</strong> {sel.desc}. {sel.progress >= 1 ? `Earned${s.celebrated?.badges?.[sel.id] ? ` ${s.celebrated.badges[sel.id]}` : ''} ✓` : `Progress ${sel.label}.`}
        </p>
      )}
    </div>
  );
}

// ---------------- Strength levels ----------------

export function StrengthLevels() {
  const s = useAppState();
  const rows = useMemo(() => strengthLevels(s), [s]);
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(id); }, []);
  return (
    <div className="card">
      <h2>Strength levels</h2>
      {rows.length === 0 ? (
        <p className="small muted">Log bench press, squat, deadlift or overhead press to see your level for your body weight ({fmt(s.profile.weightKg)} kg).</p>
      ) : rows.map((r) => (
        <div key={r.id} style={{ marginTop: 12 }}>
          <div className="row between"><div><div className="tiny muted">{r.name} · best est. 1RM {fmt(r.best, 1)} kg</div><strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>{r.label}</strong></div><span className="num small">{r.ratio.toFixed(2)}× BW</span></div>
          <div className="levels"><div className="marker" style={{ left: shown ? `${r.pos}%` : '0%' }} /></div>
          <div className="ticks">{LEVELS.map((l, i) => <span key={l} style={{ left: `${i * 25}%` }}>{l === 'Intermediate' ? 'Intermed.' : l}</span>)}</div>
          {r.nextLabel && <div className="tiny" style={{ marginTop: 4 }}>Next: <strong>{r.nextLabel} at {fmt(r.nextKg)} kg</strong> <span className="muted">(+{fmt(r.nextKg! - r.best, 1)} kg)</span></div>}
        </div>
      ))}
      <p className="tiny muted" style={{ marginTop: 10 }}>Approximate strength standards for your sex and body weight. Every PR moves the marker.</p>
    </div>
  );
}

