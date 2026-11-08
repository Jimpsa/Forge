import { useState } from 'react';
import type { Protocol } from '../types';
import { mutate, useAppState } from '../lib/storage';
import {
  ITEMS, PHASE1_AVOID, PHASE1_EAT, PHASES, RULES, YOGURT_CAP, activeTest, assessTest, dayOf, itemByKey, itemLabel,
  offProtocol, reactions, upcoming, weeklyScores, yogurtToday, type ProtocolItem,
} from '../lib/protocol';
import { analyze } from '../lib/coach';
import { fmt, prettyDate, shortDate, today, uid } from '../lib/util';
import { Bar, Seg } from '../components/ui';
import { askConfirm } from '../components/confirm';

const upd = (fn: (p: Protocol) => void) => mutate((s) => { if (s.protocol) fn(s.protocol); });

export function Reset({ goGut, ask }: { goGut: () => void; ask: (q: string) => void }) {
  const s = useAppState();
  const p = s.protocol;
  if (!p) return <StartProtocol />;
  const ph = PHASES[p.phase];
  const day = dayOf(p.phaseStart);
  const checkedIn = (s.gut ?? []).some((g) => g.date === today());

  return (
    <>
      <div className="card">
        <div className="row between">
          <div className="tiny muted">Gut reset · started {shortDate(p.start)} · {p.raw ? 'raw route' : 'cooked route'}</div>
          <span className="pill accent">Day {dayOf(p.start)}</span>
        </div>
        <h2 style={{ margin: '6px 0 2px' }}>{ph.name}</h2>
        <p className="small muted">{ph.goal}</p>
        {ph.minDays > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="row between small"><span>Day {day} of this phase</span><span className="muted">{p.phase === 1 ? 'min' : 'suggested'} {ph.minDays}{p.phase === 2 ? '–28' : ''} days</span></div>
            <Bar value={day} max={ph.minDays} />
          </div>
        )}
        {ph.moveOn && <p className="tiny muted" style={{ marginTop: 8 }}>Move on when: {ph.moveOn}</p>}
        <div className="row" style={{ marginTop: 12 }}>
          {p.phase > 1 && <button className="btn sm ghost" onClick={async () => (await askConfirm(`Go back to ${PHASES[(p.phase - 1) as 1 | 2].name}?`, 'Go back')) && upd((x) => { x.phase = (x.phase - 1) as 1 | 2; x.phaseStart = today(); })}>‹ Back a phase</button>}
          <span className="grow" />
          {p.phase < 3 && <NextPhaseButton p={p} day={day} />}
        </div>
      </div>

      <div className="card" style={{ borderColor: checkedIn ? 'var(--border)' : 'var(--warn)' }}>
        <div className="row between">
          <div><strong>{checkedIn ? '✅ Today’s log is done' : '📝 Log today'}</strong><div className="tiny muted">Stool, bloating, pain, skin, energy, sleep and mood — plus your food in the Diet tab.</div></div>
          <button className="btn sm" onClick={goGut}>{checkedIn ? 'Edit' : 'Check in'}</button>
        </div>
      </div>

      {p.phase === 1 && <PhaseOne />}
      {p.phase >= 2 && <Reintroduction ask={ask} />}
      {p.phase === 3 && <PhaseThree />}
      <OffProtocol />
      <Progress />

      <div className="card">
        <h2>Rules for all phases</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{RULES.map((r) => <li key={r} style={{ marginTop: 4 }}>{r}</li>)}</ul>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="small muted grow">Route: {p.raw ? 'raw foods' : 'high-quality cooked/pasteurised alternatives'}</span>
          <button className="btn sm" onClick={() => upd((x) => { x.raw = !x.raw; })}>Switch to {p.raw ? 'cooked' : 'raw'}</button>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'center', marginBottom: 14 }}>
        <button className="btn sm ghost danger" onClick={async () => (await askConfirm('Stop the protocol? Your food and gut logs are kept.', 'Stop protocol')) && mutate((st) => { st.protocol = undefined; })}>Stop protocol</button>
      </div>
      <p className="tiny muted" style={{ textAlign: 'center' }}>Your own protocol, tracked by the app. Not medical advice — talk to a doctor or dietitian if symptoms are severe, don’t improve, or the eczema gets infected.</p>
    </>
  );
}

function NextPhaseButton({ p, day }: { p: Protocol; day: number }) {
  const s = useAppState();
  const w = weeklyScores(s);
  const go = async () => {
    const min = PHASES[p.phase].minDays;
    const first = w.find((x) => x.score !== undefined)?.score, last = [...w].reverse().find((x) => x.score !== undefined)?.score;
    const trend = first !== undefined && last !== undefined ? ` Symptom score: ${first.toFixed(1)} in week 1 → ${last.toFixed(1)} now.` : '';
    const early = day < min ? `You're on day ${day} of a ${p.phase === 1 ? 'minimum' : 'suggested'} ${min} days.` : `You've done ${day} days.`;
    if (await askConfirm(`${early}${trend} Move on to ${PHASES[(p.phase + 1) as 2 | 3].name}?`, 'Move on'))
      upd((x) => { x.phase = (x.phase + 1) as 2 | 3; x.phaseStart = today(); });
  };
  return <button className={'btn sm' + (day >= PHASES[p.phase].minDays ? ' primary' : '')} onClick={go}>Next phase ›</button>;
}

function StartProtocol() {
  const [start, setStart] = useState(today());
  const [phase, setPhase] = useState<'1' | '2' | '3'>('1');
  const [route, setRoute] = useState<'raw' | 'cooked'>('raw');
  return (
    <>
      <div className="card">
        <h2>Gut reset protocol</h2>
        <p className="small">Calm the gut with a minimal diet, rebuild tolerance step by step, then expand into a diverse, microbiome-friendly diet. Aimed at eczema, histamine and related issues.</p>
        <div className="stack small" style={{ marginTop: 10 }}>
          <div><strong>Phase 1 · Elimination (5+ weeks):</strong> meat, eggs, animal fats, fresh white rice and peeled potatoes only.</div>
          <div><strong>Phase 2 · Reintroduction (3–4 weeks):</strong> 2A butter → cheese → egg yolks; 2B tartare/seared beef plus gentle cooked veg and low-FODMAP fruit, one at a time.</div>
          <div><strong>Phase 3 · Microbiome rebuilding:</strong> L. reuteri yogurt ramp, milk, 30+ plant foods per week, fermented foods last.</div>
        </div>
      </div>
      <div className="card stack">
        <label className="field"><span>Start date (set it in the past if you’ve already begun)</span><input type="date" value={start} max={today()} onChange={(e) => setStart(e.target.value)} /></label>
        <div><div className="small" style={{ marginBottom: 4 }}>Current phase</div><Seg value={phase} onChange={setPhase} options={[{ value: '1', label: 'Phase 1' }, { value: '2', label: 'Phase 2' }, { value: '3', label: 'Phase 3' }]} /></div>
        <div>
          <div className="small" style={{ marginBottom: 4 }}>Raw foods in phases 2–3?</div>
          <Seg value={route} onChange={setRoute} options={[{ value: 'raw', label: 'Raw route' }, { value: 'cooked', label: 'Cooked alternatives' }]} />
          <p className="tiny muted" style={{ marginTop: 6 }}>{route === 'raw' ? 'Raw butter, raw cheese, raw egg yolks, tartare and raw milk.' : 'Same steps with high-quality cooked/pasteurised versions: grass-fed butter, aged quality cheese, soft-cooked pasture-raised yolks, lightly seared beef, organic whole milk. You can switch later.'}</p>
        </div>
        <button className="btn primary block" onClick={() => mutate((s) => { s.protocol = { start, phase: +phase as 1 | 2 | 3, phaseStart: phase === '1' ? start : today(), raw: route === 'raw', tests: [] }; })}>Start tracking</button>
      </div>
    </>
  );
}

function PhaseOne() {
  return (
    <>
      <div className="card">
        <h2>✅ Eat</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{PHASE1_EAT.map((x) => <li key={x} style={{ marginTop: 4 }}>{x}</li>)}</ul>
        <h2 style={{ marginTop: 14 }}>🚫 Avoid</h2>
        <p className="small">{PHASE1_AVOID}</p>
      </div>
      <div className="card">
        <h2>Good to know</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li style={{ marginTop: 4 }}><strong>Histamine:</strong> eat meat fresh, or freeze and cook from frozen. Leftovers and slow-cooked, long-held meat build up histamine.</li>
          <li style={{ marginTop: 4 }}><strong>Rice:</strong> cooked rice left at room temperature can grow <em>Bacillus cereus</em>, which is one reason for the fresh-only rule.</li>
          <li style={{ marginTop: 4 }}><strong>Nutrients:</strong> this phase is very low in fiber, vitamin C and calcium by design. That’s expected for a few weeks; the Coach won’t flag it during the protocol. Eggs and some liver (if it suits you) help cover vitamins A, B12 and D.</li>
          <li style={{ marginTop: 4 }}><strong>Saturated fat:</strong> will be high with animal fats. If you have high cholesterol or heart risk factors, consider a blood lipid check before/after the protocol.</li>
          <li style={{ marginTop: 4 }}><strong>Energy:</strong> with few carbs, training can feel flat at first. Use the rice and potatoes around workouts.</li>
        </ul>
      </div>
    </>
  );
}

function TestCard() {
  const s = useAppState();
  const p = s.protocol!;
  const t = activeTest(p);
  if (!t) return null;
  const it = itemByKey(t.food)!;
  const d = dayOf(t.start);
  const a = assessTest(s, t);
  const finish = (result: 'ok' | 'reaction') => upd((x) => { const y = x.tests.find((z) => z.id === t.id); if (y) { y.result = result; y.ended = today(); } });
  return (
    <div className="card" style={{ borderColor: 'var(--accent)' }}>
      <div className="tiny muted">Now testing · started {prettyDate(t.start)}</div>
      <h2 style={{ margin: '4px 0' }}>{itemLabel(p, it)}</h2>
      <Bar value={Math.min(d, 3)} max={3} />
      <p className="small" style={{ marginTop: 8 }}>
        Day {d} of 2–3. {d < 3 ? 'Keep the amount small and log how you feel each day.' : 'Time to decide — did it suit you?'}
      </p>
      {it.tip && <p className="tiny muted">{it.tip}</p>}
      {a.nDuring > 0 && a.nBefore > 0 && (
        <p className="small" style={{ color: a.rose ? 'var(--warn)' : 'var(--accent)', marginTop: 6 }}>
          Symptom score {a.before!.toFixed(1)} before → {a.during!.toFixed(1)} during. {a.rose ? 'Looks like a possible reaction.' : 'No clear reaction so far.'}
        </p>
      )}
      {(a.nBefore === 0 || a.nDuring === 0) && <p className="tiny muted" style={{ marginTop: 6 }}>Check in daily so the app can compare symptoms before and during the test.</p>}
      <div className="grid2" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => finish('reaction')}>✗ Reacted — remove</button>
        <button className="btn primary" onClick={() => finish('ok')}>✓ Tolerated</button>
      </div>
    </div>
  );
}

function ItemRow({ it, p, onStart, disabled }: { it: ProtocolItem; p: Protocol; onStart: () => void; disabled: boolean }) {
  return (
    <div className="list-item">
      <div className="grow">
        <div className="small">{itemLabel(p, it)} {it.histamine && <span className="pill warn" title="On common high-histamine lists">histamine</span>}</div>
        {it.tip && <div className="tiny muted">{it.tip}</div>}
      </div>
      <button className="btn sm" disabled={disabled} onClick={onStart}>Start</button>
    </div>
  );
}

function Reintroduction({ ask }: { ask: (q: string) => void }) {
  const s = useAppState();
  const p = s.protocol!;
  const cur = activeTest(p);
  const next = upcoming(p);
  const bad = reactions(p);
  const ok = p.tests.filter((t) => t.result === 'ok');
  const lastEnd = [...p.tests].filter((t) => t.ended && t.result === 'ok').map((t) => t.ended!).sort().at(-1);
  const tooSoon = lastEnd ? dayOf(lastEnd) < 3 : false;
  const start = async (key: string) => {
    if (tooSoon && !(await askConfirm('Your last food was finished less than 2–3 days ago. Start the next one anyway?', 'Start anyway'))) return;
    upd((x) => { x.tests.push({ id: uid(), food: key, start: today(), result: 'testing' }); });
  };
  const steps: { key: string; title: string; items: ProtocolItem[]; note?: string }[] = p.phase === 2
    ? [
      { key: '2A', title: 'Step 2A · ' + (p.raw ? 'Raw animal foods' : 'Quality animal foods') + ' (in this order)', items: next.filter((i) => i.step === '2A') },
      { key: '2B-1', title: 'Step 2B · ' + (p.raw ? 'Tartare' : 'Seared beef'), items: next.filter((i) => i.step === '2B' && !i.group) },
      { key: '2B-v', title: 'Step 2B · Gentle vegetables (cooked/peeled)', items: next.filter((i) => i.group === 'veg') },
      { key: '2B-f', title: 'Step 2B · Gentle fruit', items: next.filter((i) => i.group === 'fruit') },
    ]
    : [
      { key: '3', title: 'Milk (after the yogurt is well tolerated)', items: next.filter((i) => i.step === '3') },
      { key: '3F', title: 'Fermented foods last (start with 1–2 tsp)', items: next.filter((i) => i.step === '3F') },
    ];
  const anyRaw = p.raw && ITEMS.some((i) => i.rawRisk && (i.step === '2A' || i.step === '2B' || i.step === '3'));

  return (
    <>
      <TestCard />
      {steps.filter((x) => x.items.length).map((st) => (
        <div className="card" key={st.key}>
          <h2>{st.title}</h2>
          {st.items.map((it, i) => <ItemRow key={it.key} it={it} p={p} disabled={!!cur || (st.key === '2A' && i > 0)} onStart={() => start(it.key)} />)}
          {cur && <p className="tiny muted" style={{ marginTop: 6 }}>Finish the current test first — one new food at a time.</p>}
        </div>
      ))}
      {(ok.length > 0 || bad.length > 0) && (
        <div className="card">
          <h2>Results</h2>
          {ok.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{ok.map((t) => <span key={t.id} className="pill accent">✓ {itemLabel(p, itemByKey(t.food)!)}</span>)}</div>}
          {bad.map((t) => (
            <div key={t.id} className="list-item">
              <div className="grow"><div className="small">✗ {itemLabel(p, itemByKey(t.food)!)}</div><div className="tiny muted">Reacted {t.ended ? prettyDate(t.ended) : ''}. Wait until you’re settled, then retry a smaller amount.</div></div>
              <button className="btn sm" disabled={!!cur} onClick={() => start(t.food)}>Retry</button>
            </div>
          ))}
          <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => ask('Based on my reintroduction results so far, what should I test next and how should I build meals from the foods I tolerate?')}>Ask the coach for meal ideas</button>
        </div>
      )}
      {anyRaw && p.phase === 2 && (
        <details className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>⚠️ Raw food safety</summary>
          <ul className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>
            <li style={{ marginTop: 4 }}>Raw dairy, raw eggs and raw meat can carry <em>Salmonella</em>, <em>E. coli</em>, <em>Listeria</em> and <em>Campylobacter</em>. Pregnant people, young children, older adults and anyone with a weakened immune system should avoid them.</li>
            <li style={{ marginTop: 4 }}>Buy from trusted, tested sources; keep it cold; eat it fresh. For tartare, mince a fresh whole cut the same day.</li>
            <li style={{ marginTop: 4 }}>Fever, bloody diarrhoea or severe stomach pain after raw food → contact a doctor.</li>
            <li style={{ marginTop: 4 }}>Prefer lower risk? Switch to the cooked route at the bottom of this page — same steps, high-quality cooked versions.</li>
          </ul>
        </details>
      )}
    </>
  );
}

function PhaseThree() {
  const s = useAppState();
  const p = s.protocol!;
  const y = yogurtToday(p);
  const plants = analyze(s, 14).plantsThisWeek;
  return (
    <>
      <div className="card">
        <h2>1 · Homemade L. reuteri yogurt</h2>
        {!y ? (
          <>
            <p className="small">Start with 1 tablespoon on day 1, then add 1 tablespoon each day. Stop increasing at a comfortable amount (suggested cap around 1 cup ≈ {YOGURT_CAP} tbsp). If you get symptoms, drop back to the last amount that felt fine.</p>
            <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => upd((x) => { x.yogurt = { start: today() }; })}>Start yogurt ramp today</button>
          </>
        ) : (
          <>
            <div className="row between"><span className="small">Day {y.day}</span><span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{y.tbsp} tbsp today</span></div>
            <div style={{ margin: '8px 0' }}><Bar value={y.tbsp} max={YOGURT_CAP} /></div>
            <p className="tiny muted">{y.holding ? `Holding at ${y.cap} tbsp/day.` : `Tomorrow: ${Math.min(y.cap, y.tbsp + 1)} tbsp.`} Log it in the Diet tab as “L. reuteri yogurt”.</p>
            <div className="grid2" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => upd((x) => { x.yogurt!.cap = Math.max(1, y.tbsp - 1); })}>Symptoms — drop back</button>
              <button className="btn" disabled={y.holding} onClick={() => upd((x) => { x.yogurt!.cap = y.tbsp; })}>Feels right — hold here</button>
            </div>
            {y.holding && <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => upd((x) => { x.yogurt!.cap = undefined; })}>Resume increasing</button>}
          </>
        )}
      </div>
      <div className="card">
        <h2>3 · Diversify</h2>
        <div className="row between small"><span>Different plant foods this week</span><span className="num">{plants} / 30</span></div>
        <div style={{ margin: '6px 0' }}><Bar value={plants} max={30} /></div>
        <p className="tiny muted">Widen veg, fruit, herbs, nuts, seeds and whole foods gradually — still one new food at a time if you’re sensitive. 30+ different plants per week is a common target.</p>
      </div>
    </>
  );
}

function OffProtocol() {
  const s = useAppState();
  const list = offProtocol(s);
  if (!list.length) return null;
  return (
    <div className="card">
      <h2>Not on your current list</h2>
      <p className="tiny muted" style={{ marginBottom: 6 }}>Logged in the last 7 days, outside {PHASES[s.protocol!.phase].name}. If one was a deliberate test, start it as a test so it’s tracked.</p>
      {list.map((x) => <div key={x.name} className="list-item small"><span className="grow">{x.name}</span><span className="muted">{x.days} day{x.days > 1 ? 's' : ''}</span></div>)}
    </div>
  );
}

function Progress() {
  const s = useAppState();
  const w = weeklyScores(s).filter((x) => x.n > 0);
  if (!w.length) return null;
  const max = Math.max(4, ...w.map((x) => x.score ?? 0));
  return (
    <div className="card">
      <h2>Symptoms by protocol week</h2>
      {w.map((x) => (
        <div key={x.week} style={{ marginBottom: 8 }}>
          <div className="row between small"><span>Week {x.week} <span className="tiny muted">({x.n} check-ins)</span></span><span className="num muted">score {fmt(x.score, 1)}{x.skin !== undefined ? ` · skin ${fmt(x.skin, 1)}/3` : ''}</span></div>
          <Bar value={x.score ?? 0} max={max} color="var(--warn)" />
        </div>
      ))}
      <p className="tiny muted">Score = bloating + pain + reflux + skin (0–3 each) + 1 for hard/loose stool. Lower is better.</p>
    </div>
  );
}
