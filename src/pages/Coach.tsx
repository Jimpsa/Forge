import { useEffect, useMemo, useRef, useState } from 'react';
import type { GutLog, Severity } from '../types';
import { getState, mutate, useAppState } from '../lib/storage';
import { analyze, type Suggestion } from '../lib/coach';
import { askCoach, errorText, getSample } from '../lib/ai';
import { BRISTOL, GUIDE, RED_FLAGS, SEVERITY, gutPatterns } from '../lib/gut';
import { fmt, prettyDate, today } from '../lib/util';
import { Bar, Seg, Stat } from '../components/ui';
import { askConfirm } from '../components/confirm';
import { Reset } from './Reset';
import { Md } from '../components/Markdown';
import { HistamineCard, HistSymptomChips } from '../components/Histamine';

type Sub = 'insights' | 'ask' | 'gut' | 'reset';

export function Coach() {
  const s = useAppState();
  const [sub, setSub] = useState<Sub>(s.protocol ? 'reset' : 'insights');
  const [draft, setDraft] = useState('');
  const ask = (q: string) => { setDraft(q); setSub('ask'); };
  return (
    <div>
      <div className="page-head"><h1>Coach</h1></div>
      <div style={{ marginBottom: 14 }}>
        <Seg value={sub} onChange={setSub} options={[{ value: 'insights', label: 'Insights' }, { value: 'ask', label: 'Ask' }, { value: 'gut', label: 'Gut' }, { value: 'reset', label: 'Reset' }]} />
      </div>
      {sub === 'insights' && <Insights ask={ask} />}
      {sub === 'ask' && <AskCoach draft={draft} setDraft={setDraft} />}
      {sub === 'gut' && <Gut ask={ask} />}
      {sub === 'reset' && <Reset goGut={() => setSub('gut')} ask={ask} />}
    </div>
  );
}

// ---------------- Insights ----------------

const kcalPill = (k: number) => <span className={'pill ' + (k < 0 ? 'accent' : 'warn')} style={{ whiteSpace: 'nowrap' }}>{k > 0 ? '+' : '−'}{Math.abs(k)} kcal/day</span>;

function SuggestionList({ items }: { items: Suggestion[] }) {
  return <>{items.map((x, i) => (
    <div key={i} className="list-item" style={{ alignItems: 'flex-start' }}>
      <div className="grow"><div><strong>{x.title}</strong></div><div className="small muted">{x.detail}</div></div>
      {kcalPill(x.kcal)}
    </div>
  ))}</>;
}

function Insights({ ask }: { ask: (q: string) => void }) {
  const s = useAppState();
  const a = useMemo(() => analyze(s, 14), [s]);
  const toneColor = a.verdict.tone === 'good' ? 'var(--accent)' : a.verdict.tone === 'warn' ? 'var(--warn)' : 'var(--border)';
  const goalWord = a.goal === 'cut' ? 'lose fat' : a.goal === 'bulk' ? 'build muscle' : 'maintain';

  return (
    <>
      <div className="card" style={{ borderColor: toneColor }}>
        <div className="tiny muted">Goal: {goalWord} · last {a.windowDays} days · {a.loggedDays} days fully logged</div>
        <h2 style={{ margin: '6px 0' }}>{a.verdict.title}</h2>
        <p className="small">{a.verdict.text}</p>
        {a.enough && (
          <div className="grid3" style={{ marginTop: 12 }}>
            <Stat v={fmt(a.avgKcal)} l={`avg kcal (target ${fmt(a.avgTarget)})`} />
            <Stat v={a.trend ? `${a.trend.kgPerWeek > 0 ? '+' : ''}${a.trend.kgPerWeek.toFixed(2)}` : '–'} l={`kg/week (goal ${a.goalRate > 0 ? '+' : ''}${a.goalRate})`} />
            <Stat v={fmt(a.measuredMaintenance ?? a.formulaMaintenance)} l={a.measuredMaintenance ? 'measured maintenance' : 'formula maintenance'} />
          </div>
        )}
        {!a.trend && a.enough && <p className="tiny muted" style={{ marginTop: 8 }}>Tip: weigh in 3+ times a week (Progress → Body). Advice gets much more accurate once your real weight trend is known.</p>}
      </div>

      {a.measuredMaintenance && a.suggestedBase && Math.abs(a.suggestedBase - (s.profile.maintenanceKcal ?? a.formulaMaintenance)) > 75 && (
        <div className="card">
          <h2>Your measured maintenance</h2>
          <p className="small">From what you ate and how your weight actually moved over the last 4 weeks, you maintain at about <strong>{fmt(a.measuredMaintenance)} kcal/day</strong> (formula estimate: {fmt(a.formulaMaintenance)}). This is usually more accurate than any formula — as long as your logging is complete.</p>
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => mutate((st) => { st.profile.maintenanceKcal = a.suggestedBase; })}>Use it for my targets</button>
        </div>
      )}

      {a.enough && a.eatLess.length > 0 && (
        <div className="card">
          <h2>Biggest wins: eat a bit less of</h2>
          <p className="tiny muted" style={{ marginBottom: 6 }}>Ranked by calories saved, from what you actually eat. You need ≈{a.gap} kcal/day less{a.gapSource === 'trend' ? ' (based on your weight trend)' : ''}.</p>
          <SuggestionList items={a.eatLess} />
        </div>
      )}
      {a.enough && a.eatMore.length > 0 && (
        <div className="card">
          <h2>Easy ways to eat more</h2>
          <p className="tiny muted" style={{ marginBottom: 6 }}>You need ≈{-a.gap} kcal/day more{a.gapSource === 'trend' ? ' (based on your weight trend)' : ''}. Calorie-dense additions that don't fill you up much:</p>
          <SuggestionList items={a.eatMore} />
        </div>
      )}
      {a.enough && a.moveMore.length > 0 && (
        <div className="card">
          <h2>{a.gap > 0 ? '…or move more instead' : 'Training & cardio'}</h2>
          {a.moveMore.map((m, i) => <div key={i} className="list-item" style={{ display: 'block' }}><strong>{m.title}</strong><div className="small muted">{m.detail}</div></div>)}
        </div>
      )}

      {a.enough && (
        <div className="card">
          <h2>Protein</h2>
          <div style={{ marginBottom: 8 }}><Bar value={a.avgProtein} max={a.proteinTarget} color="var(--protein)" /></div>
          <p className="small">{a.protein.text}</p>
          {a.protein.options.length > 0 && <><h3 style={{ marginTop: 10 }}>Easy additions</h3>{a.protein.options.map((o, i) => (
            <div key={i} className="list-item"><span className="grow small">{o.title}</span><span className="small" style={{ color: 'var(--protein)' }}>{o.detail}</span><span className="tiny muted">{o.kcal} kcal</span></div>
          ))}</>}
        </div>
      )}

      {a.enough && (a.quality.length > 0 || a.training.length > 0) && (
        <div className="card">
          <h2>Food quality & training</h2>
          {[...a.quality, ...a.training].map((q, i) => <div key={i} className="list-item" style={{ display: 'block' }}><strong>{q.title}</strong><div className="small muted">{q.detail}</div></div>)}
        </div>
      )}

      {a.enough && a.topFoods.length > 0 && (
        <div className="card">
          <h2>Where your calories come from</h2>
          {a.topFoods.map((f) => (
            <div key={f.foodId} style={{ marginBottom: 8 }}>
              <div className="row between small"><span>{f.name}</span><span className="num muted">{fmt(f.kcalPerDay)} kcal/day · {Math.round(f.share * 100)}%</span></div>
              <Bar value={f.share} max={a.topFoods[0].share} color="var(--carbs)" />
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Want a plan?</h2>
        <div className="row wrap" style={{ gap: 6 }}>
          {['Make me a meal plan for tomorrow that hits my targets', 'Why am I not progressing, and what should I change first?', 'Give me 5 high-protein snacks I can grab on the go'].map((q) => <button key={q} className="btn sm" onClick={() => ask(q)}>{q}</button>)}
        </div>
      </div>
      <p className="tiny muted" style={{ textAlign: 'center' }}>General guidance, not medical advice. Calorie numbers are estimates; your weight trend is the real measure.</p>
    </>
  );
}

// ---------------- Ask Coach (AI) ----------------

const STARTERS = [
  'What should I eat after training?',
  'How do I hit my protein without shakes?',
  'I often feel bloated after dinner — what can I try?',
  'Should I change my calories based on my progress?',
];

function AskCoach({ draft, setDraft }: { draft: string; setDraft: (s: string) => void }) {
  const s = useAppState();
  const chat = s.chat ?? [];
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const [err, setErr] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { let on = true; getSample().then((f) => on && setAvailable(!!f)); return () => { on = false; }; }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat.length, live]);
  useEffect(() => () => ctl.current?.abort(), []);

  const send = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setErr(''); setDraft(''); setBusy(true); setLive('');
    mutate((st) => { st.chat = [...(st.chat ?? []), { role: 'user' as const, content: text, at: Date.now() }].slice(-40); });
    ctl.current = new AbortController();
    try {
      const res = await askCoach(getState(), getState().chat ?? [], setLive, ctl.current.signal);
      mutate((st) => { st.chat = [...(st.chat ?? []), { role: 'assistant' as const, content: res.text + (res.truncated ? '\n\n_(cut short — ask me to continue)_' : ''), at: Date.now() }].slice(-40); });
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (e?.text) mutate((st) => { st.chat = [...(st.chat ?? []), { role: 'assistant' as const, content: e.text + '\n\n_(interrupted)_', at: Date.now() }]; });
      if (e?.code !== 'cancelled') setErr(errorText(e?.code));
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled'].includes(e?.code)) setAvailable(false);
    } finally { setBusy(false); setLive(''); }
  };

  if (available === false) {
    return (
      <div className="card">
        <h2>AI coach</h2>
        <p className="small">The AI coach runs on Claude and is available when you open Forge on claude.ai (it uses your own Claude account — nothing extra to pay or set up).</p>
        <p className="small muted" style={{ marginTop: 8 }}>{err || 'In a self-hosted version this would connect to the Claude API through your own server.'}</p>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ minHeight: 200 }}>
        {chat.length === 0 && !busy && (
          <div>
            <p className="small">Hi{s.profile.name ? ` ${s.profile.name}` : ''}! I’m an <strong>AI coach</strong> for <strong>diet, training and gut health</strong>. I can see a summary of your logged food, weight trend, workouts and gut check-ins, so you can ask me things like:</p>
            <div className="stack" style={{ marginTop: 10 }}>{STARTERS.map((q) => <button key={q} className="btn sm block" style={{ textAlign: 'left', whiteSpace: 'normal' }} onClick={() => send(q)}>{q}</button>)}</div>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', margin: '8px 0' }}>
            <div className="small" style={{ maxWidth: '88%', padding: '8px 12px', borderRadius: 12, background: m.role === 'user' ? 'rgba(124,242,156,.14)' : 'var(--surface-2)' }}>
              {m.role === 'user' ? m.content : <Md text={m.content} />}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ margin: '8px 0' }}>
            <div className="small" style={{ maxWidth: '88%', padding: '8px 12px', borderRadius: 12, background: 'var(--surface-2)' }}>
              {live ? <Md text={live} /> : <span className="muted">Thinking…</span>}
            </div>
          </div>
        )}
        {err && <p className="small" style={{ color: 'var(--warn)' }}>{err}</p>}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); send(draft); }} style={{ position: 'sticky', bottom: 'calc(72px + env(safe-area-inset-bottom))', background: 'var(--bg)', padding: '8px 0' }}>
        <input placeholder="Ask about food, training or your gut…" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} />
        {busy ? <button type="button" className="btn" onClick={() => ctl.current?.abort()}>Stop</button> : <button className="btn primary" disabled={!draft.trim()}>Send</button>}
      </form>
      <div className="row between">
        <span className="tiny muted">You’re chatting with an AI. It can make mistakes, and it’s not medical advice. Uses your Claude usage.</span>
        {chat.length > 0 && <button className="btn sm ghost" onClick={async () => (await askConfirm('Clear this conversation?', 'Clear')) && mutate((st) => { st.chat = []; })}>New chat</button>}
      </div>
    </>
  );
}

// ---------------- Gut ----------------

const WELL = ['Poor', 'OK', 'Good', 'Great'];

function SevPicker({ label, value, onChange }: { label: string; value: Severity; onChange: (v: Severity) => void }) {
  return (
    <div>
      <div className="small" style={{ marginBottom: 4 }}>{label}</div>
      <Seg value={String(value)} onChange={(v) => onChange(Number(v) as Severity)} options={SEVERITY.map((l, i) => ({ value: String(i), label: l }))} />
    </div>
  );
}

function Gut({ ask }: { ask: (q: string) => void }) {
  const s = useAppState();
  const histOn = !!s.settings?.histamine;
  const existingAny = (s.gut ?? []).find((x) => x.date === today());
  const existing = existingAny?.wellnessOnly ? undefined : existingAny;
  const [g, setG] = useState<GutLog>(existingAny ?? { date: today(), bloating: 0, pain: 0, reflux: 0 });
  const [saved, setSaved] = useState(false);
  const pat = useMemo(() => gutPatterns(s), [s]);
  const recent = [...(s.gut ?? [])].filter((x) => !x.wellnessOnly).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  const save = () => {
    mutate((st) => { st.gut = [...(st.gut ?? []).filter((x) => x.date !== g.date), { ...g, wellnessOnly: undefined }]; });
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <div className="card stack">
        <h2>Today’s gut check-in</h2>
        <SevPicker label="Bloating / gas" value={g.bloating} onChange={(v) => setG({ ...g, bloating: v })} />
        <SevPicker label="Stomach pain / cramps" value={g.pain} onChange={(v) => setG({ ...g, pain: v })} />
        <SevPicker label="Reflux / heartburn" value={g.reflux} onChange={(v) => setG({ ...g, reflux: v })} />
        <SevPicker label="Skin / eczema (itch, flare)" value={g.skin ?? 0} onChange={(v) => setG({ ...g, skin: v })} />
        {histOn && <HistSymptomChips value={g.hist ?? []} onChange={(v) => setG({ ...g, hist: v.length ? v : undefined })} />}
        <div className="grid4">
          {(['energy', 'sleep', 'mood', 'soreness'] as const).map((k) => (
            <label key={k} className="field"><span>{k[0].toUpperCase() + k.slice(1)}</span>
              <select value={g[k] ?? ''} onChange={(e) => setG({ ...g, [k]: e.target.value === '' ? undefined : (+e.target.value as Severity) })}>
                <option value="">–</option>{(k === 'soreness' ? ['None', 'Mild', 'Quite sore', 'Very sore'] : WELL).map((l, i) => <option key={l} value={i}>{l}</option>)}
              </select>
            </label>
          ))}
        </div>
        <label className="field"><span>Stool (Bristol scale) — optional</span>
          <select value={g.stool ?? ''} onChange={(e) => setG({ ...g, stool: e.target.value ? +e.target.value : undefined })}>
            <option value="">No bowel movement / skip</option>
            {BRISTOL.map((b) => <option key={b.type} value={b.type}>Type {b.type}: {b.label} ({b.meaning})</option>)}
          </select>
        </label>
        <label className="field"><span>Notes (stress, sleep, period, medication…)</span><input value={g.notes ?? ''} onChange={(e) => setG({ ...g, notes: e.target.value || undefined })} /></label>
        <button className="btn primary block" onClick={save}>{saved ? 'Saved ✓' : existing ? 'Update check-in' : 'Save check-in'}</button>
        <p className="tiny muted">Takes 10 seconds. Together with your food log, this shows which foods line up with bad days.</p>
      </div>

      <HistamineCard ask={ask} />

      <div className="card">
        <h2>Patterns</h2>
        {pat.checkins < 7 ? (
          <p className="small muted">{pat.checkins}/7 check-ins in the last 60 days. Keep logging food and checking in daily — patterns appear after about a week.</p>
        ) : pat.patterns.length === 0 && pat.extra.length === 0 ? (
          <p className="small">No clear food pattern yet across {pat.checkins} check-ins. 👍</p>
        ) : (
          <>
            {pat.patterns.map((x) => (
              <div key={x.key} className="list-item" style={{ display: 'block' }}>
                <div className="row between"><strong>{x.label}</strong><span className="pill warn">{x.ratio.toFixed(1)}× symptoms</span></div>
                <div className="small muted">Symptom score {x.withAvg.toFixed(1)} on days with it ({x.nWith}) vs {x.withoutAvg.toFixed(1)} without ({x.nWithout}). {x.why}</div>
              </div>
            ))}
            {pat.extra.map((t, i) => <div key={i} className="list-item small">{t}</div>)}
            <p className="tiny muted" style={{ marginTop: 8 }}>These are correlations from a small sample, not proof. To confirm a trigger: cut it for 2 weeks, then reintroduce it and see whether symptoms return — ideally with a dietitian.</p>
          </>
        )}
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => ask('Look at my gut check-ins and food log. What might be causing my symptoms, and what should I try first?')}>Ask the coach about my gut</button>
      </div>

      {recent.length > 0 && (
        <div className="card">
          <h2>Recent check-ins</h2>
          {recent.map((x) => (
            <div key={x.date} className="list-item small">
              <span style={{ width: 90 }}>{prettyDate(x.date)}</span>
              <span className="grow muted">Bloat {SEVERITY[x.bloating]} · Pain {SEVERITY[x.pain]} · Reflux {SEVERITY[x.reflux]}{x.skin !== undefined ? ` · Skin ${SEVERITY[x.skin]}` : ''}{x.stool ? ` · Type ${x.stool}` : ''}{x.energy !== undefined ? ` · Energy ${WELL[x.energy]}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ borderColor: 'var(--danger)' }}>
        <h2>⚠️ See a doctor if you have</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{RED_FLAGS.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="tiny muted" style={{ marginTop: 8 }}>Also see a doctor if symptoms last more than a few weeks despite changes. Severe pain, heavy bleeding or vomiting blood: seek urgent care.</p>
      </div>

      <div className="card">
        <h2>Gut health guide</h2>
        {GUIDE.map((sec) => (
          <details key={sec.title} className="list-item" style={{ display: 'block' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{sec.title}</summary>
            <ul className="small" style={{ paddingLeft: 18, marginBottom: 4 }}>{sec.points.map((pt) => <li key={pt} style={{ marginTop: 4 }}>{pt}</li>)}</ul>
          </details>
        ))}
        <p className="tiny muted" style={{ marginTop: 8 }}>General information, not a diagnosis. Most mild issues improve with these habits; ongoing symptoms deserve a proper check-up.</p>
      </div>
    </>
  );
}
