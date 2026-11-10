import { trs } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { confetti, haptic, replay, sound, useCountUp } from '../lib/fx';
import type { FoodEntry, Meal } from '../types';
import { MEALS, NUTRIENTS } from '../types';
import { mutate, useAppState } from '../lib/storage';
import { dailyTargets, entriesFor, findFood, isTrainingDay, microTargets, scale, sum } from '../lib/nutrition';
import { addDays, fmt, prettyDate, today, uid } from '../lib/util';
import { Bar, EmptyState, NumField, Ring, Seg, Sheet } from '../components/ui';
import { FoodPicker, NutrientTable } from '../components/FoodPicker';
import { askConfirm } from '../components/confirm';
import { MealPlanCard, MealPlanner } from './MealPlanner';
import { HistBadge } from '../components/Histamine';
import { tr } from '../i18n';

export function DateNav({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  return (
    <div className="row">
      <button className="btn sm" onClick={() => setDate(addDays(date, -1))} aria-label={tr("Previous day")}>‹</button>
      <button className="btn sm" style={{ minWidth: 120 }} onClick={() => setDate(today())}>{prettyDate(date)}</button>
      <button className="btn sm" onClick={() => setDate(addDays(date, 1))} disabled={date >= today()} aria-label={tr("Next day")}>›</button>
    </div>
  );
}

export function MacroSummary({ date }: { date: string }) {
  const s = useAppState();
  const t = dailyTargets(s.profile, isTrainingDay(s, date));
  const n = sum(entriesFor(s, date).map((e) => e.nutrients));
  const left = t.kcal - (n.kcal ?? 0);
  const shownLeft = useCountUp(left);
  const ringRef = useRef<HTMLDivElement>(null);
  // Soft glow + tick when protein crosses into the target zone (not on first render or date change).
  const prevP = useRef<{ date: string; hit: boolean } | null>(null);
  const hitP = (n.protein ?? 0) >= t.protein * 0.9;
  useEffect(() => {
    if (prevP.current && prevP.current.date === date && !prevP.current.hit && hitP) { replay(ringRef.current, 'glow-hit'); haptic('tap'); sound('done'); }
    prevP.current = { date, hit: hitP };
  }, [hitP, date]);
  const macros = [
    { k: 'protein' as const, label: tr("Protein"), color: 'var(--protein)', target: t.protein },
    { k: 'carbs' as const, label: tr("Carbs"), color: 'var(--carbs)', target: t.carbs },
    { k: 'fat' as const, label: tr("Fat"), color: 'var(--fat)', target: t.fat },
  ];
  return (
    <div className="row" style={{ gap: 18, alignItems: 'center' }}>
      <div ref={ringRef} style={{ borderRadius: '50%', flex: 'none' }}><Ring value={n.kcal ?? 0} max={t.kcal} label={fmt(Math.abs(shownLeft))} sub={trs(left >= 0 ? tr("kcal left") : tr("kcal over"))} /></div>
      <div className="grow stack">
        {macros.map((m) => (
          <div key={m.k}>
            <div className="row between small"><span>{tr(m.label)}</span><span className="num muted">{fmt(n[m.k])} / {m.target} g</span></div>
            <Bar value={n[m.k] ?? 0} max={m.target} color={m.color} />
          </div>
        ))}
        <div className="tiny muted">{fmt(n.kcal)} / {t.kcal}{' '}{tr("kcal")}{' '}{t.trainingDay ? <span className="pill accent">{tr("training day +")}{s.profile.trainingDayKcal}</span> : <span className="pill">{tr("rest day")}</span>}</div>
      </div>
    </div>
  );
}

export function WaterCard({ date }: { date: string }) {
  const s = useAppState();
  const ml = s.water[date] ?? 0;
  const goal = s.profile.waterGoalMl;
  const shown = useCountUp(ml / 1000, 700);
  const btns = useRef<HTMLDivElement>(null);
  const add = (d: number) => {
    const before = ml;
    mutate((st) => { st.water[date] = Math.max(0, (st.water[date] ?? 0) + d); });
    haptic('tick');
    if (before < goal && before + d >= goal) { confetti(btns.current, 40); haptic('success'); }
  };
  const level = Math.min(1, ml / goal);
  return (
    <div className="card">
      <div className="row" style={{ gap: 16, alignItems: 'center' }}>
        <svg width="70" height="94" viewBox="0 0 90 120" role="img" aria-label={tr("Water {v0} of {v1} litres", { v0: fmt(ml / 1000, 2), v1: fmt(goal / 1000, 1) })} style={{ flex: 'none' }}>
          <defs><clipPath id={tr("glass-{v0}", { v0: date })}><path d="M10 6 H80 L72 112 Q71 116 66 116 H24 Q19 116 18 112 Z" /></clipPath></defs>
          <g clipPath={tr("url(#glass-{v0})", { v0: date })}>
            <rect x="0" y="0" width="90" height="120" fill="var(--surface-2)" />
            <g className="glass-fill" style={{ transform: `translateY(${112 - level * 104}px)` }}>
              <path className="glass-wave" d="M0 10 Q15 2 30 10 T60 10 T90 10 T120 10 T150 10 V130 H0 Z" fill="var(--water)" opacity=".85" />
            </g>
          </g>
          <path d="M10 6 H80 L72 112 Q71 116 66 116 H24 Q19 116 18 112 Z" fill="none" stroke="var(--border)" strokeWidth="3" />
        </svg>
        <div className="grow">
          <div className="row between"><h2 style={{ margin: 0 }}>{tr("Water")}</h2>{ml >= goal && <span className="pill accent">{tr("Goal reached ✦")}</span>}</div>
          <div style={{ margin: '4px 0 10px' }}><span className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem' }}>{trs(shown.toFixed(2))}</span> <span className="muted small">/ {fmt(goal / 1000, 1)} L</span></div>
        </div>
      </div>
      <div className="row wrap" ref={btns} style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => add(250)}>{tr("+250 ml")}</button>
        <button className="btn sm" onClick={() => add(500)}>{tr("+500 ml")}</button>
        <button className="btn sm" onClick={() => add(750)}>{tr("+750 ml")}</button>
        <button className="btn sm ghost" onClick={() => add(-250)} disabled={ml <= 0}>−250</button>
      </div>
    </div>
  );
}

export function Diet() {
  const s = useAppState();
  const [date, setDate] = useState(today());
  const [picker, setPicker] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [view, setView] = useState<'log' | 'nutrients'>('log');
  const [myFoods, setMyFoods] = useState(false);
  const [planner, setPlanner] = useState(false);
  const entries = entriesFor(s, date);
  const yesterday = entriesFor(s, addDays(date, -1));
  const totals = sum(entries.map((e) => e.nutrients));
  const t = dailyTargets(s.profile, isTrainingDay(s, date));
  const micro = microTargets(s.profile, t.kcal);

  const copyYesterday = () => mutate((st) => { yesterday.forEach((e) => st.entries.push({ ...e, id: uid(), date })); });

  return (
    <div>
      <div className="page-head"><h1>{tr("Diet")}</h1><DateNav date={date} setDate={setDate} /></div>
      <div className="card"><MacroSummary date={date} /></div>
      {date === today() && <MealPlanCard onBuild={() => setPlanner(true)} />}
      <MealPlanner open={planner} onClose={() => setPlanner(false)} />
      <div style={{ marginBottom: 14 }}>
        <Seg value={view} onChange={setView} options={[{ value: 'log', label: tr("Food log") }, { value: 'nutrients', label: tr("Vitamins & minerals") }]} />
      </div>

      {view === 'log' ? (
        <>
          {entries.length === 0 && (
            <div className="card"><EmptyState kind="plate" title={tr("No meals logged yet")} text={yesterday.length ? tr("Start with breakfast, or copy the day before in one tap.") : tr("Start with breakfast. Your recent foods are one tap away.")} action={<button className="btn primary" onClick={() => setPicker('breakfast')}>{tr("+ Add breakfast")}</button>} /></div>
          )}
          {entries.length === 0 && yesterday.length > 0 && (
            <button className="btn block" style={{ marginBottom: 14 }} onClick={copyYesterday}>{tr("Copy")}{' '}{yesterday.length}{' '}{tr("items from the day before")}</button>
          )}
          {MEALS.map((m) => {
            const list = entries.filter((e) => e.meal === m.key);
            const kcal = list.reduce((a, e) => a + (e.nutrients.kcal ?? 0), 0);
            return (
              <div className="card" key={m.key}>
                <div className="row between">
                  <h2 style={{ margin: 0 }}>{tr(m.label)} <span className="muted small num">{trs(kcal ? tr("{v0} kcal", { v0: fmt(kcal) }) : '')}</span></h2>
                  <button className="btn sm primary" onClick={() => setPicker(m.key)}>{tr("+ Add")}</button>
                </div>
                {list.length > 0 && <div style={{ marginTop: 8 }}>
                  {list.map((e) => (
                    <div key={e.id} className="list-item click" onClick={() => setEditing(e)}>
                      <div className="grow">
                        <div className="small">{trs(e.name)} <HistBadge name={e.name} /></div>
                        <div className="tiny muted">{fmt(e.grams)} g · P {fmt(e.nutrients.protein)} · C {fmt(e.nutrients.carbs)} · F {fmt(e.nutrients.fat)}</div>
                      </div>
                      <span className="num small">{fmt(e.nutrients.kcal)}</span>
                    </div>
                  ))}
                </div>}
              </div>
            );
          })}
          <WaterCard date={date} />
          <button className="btn block ghost" onClick={() => setMyFoods(true)}>{tr("Manage my foods & recipes")}</button>
        </>
      ) : (
        <div className="card">
          <h2>{tr("Daily nutrients")}</h2>
          <p className="tiny muted" style={{ marginBottom: 10 }}>{tr("Based on general adult reference values. Built-in foods have full data; some online products only list macros, so micronutrients can read low.")}</p>
          {NUTRIENTS.slice(4).map(({ key, label, unit }) => {
            const target = micro[key];
            const v = totals[key] ?? 0;
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <div className="row between small">
                  <span>{trs(label)} {target?.limit && <span className="pill">{tr("limit")}</span>}</span>
                  <span className="num muted">{fmt(v, v < 10 ? 1 : 0)} / {trs(target ? fmt(target.value, target.value < 10 ? 1 : 0) : '–')} {trs(unit)}</span>
                </div>
                {target && <Bar value={v} max={target.value} limit={target.limit} color={target.limit ? 'var(--muted)' : 'var(--accent)'} />}
              </div>
            );
          })}
        </div>
      )}

      <FoodPicker open={picker !== null} onClose={() => setPicker(null)} date={date} meal={picker ?? 'breakfast'} />
      <EditEntry entry={editing} onClose={() => setEditing(null)} />
      <MyFoods open={myFoods} onClose={() => setMyFoods(false)} />
    </div>
  );
}

function EditEntry({ entry, onClose }: { entry: FoodEntry | null; onClose: () => void }) {
  const s = useAppState();
  const [grams, setGrams] = useState<number | undefined>();
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [lastId, setLastId] = useState<string>();
  if (entry && entry.id !== lastId) { setLastId(entry.id); setGrams(entry.grams); setMeal(entry.meal); }
  if (!entry) return null;
  const food = findFood(s, entry.foodId);
  // Rescale from the original snapshot so it still works if the food was deleted.
  const n = food ? scale(food.per100, grams ?? 0) : scale(scale(entry.nutrients, 10000 / entry.grams), grams ?? 0);
  const save = () => { mutate((st) => { const e = st.entries.find((x) => x.id === entry.id); if (e) { e.grams = grams ?? 0; e.meal = meal; e.nutrients = n; } }); onClose(); };
  const del = () => { mutate((st) => { st.entries = st.entries.filter((x) => x.id !== entry.id); }); onClose(); };
  return (
    <Sheet open onClose={onClose} title={trs(entry.name)}>
      <div className="stack">
        <div className="grid2">
          <NumField label={tr("Amount")} suffix="g" value={grams} onChange={setGrams} />
          <label className="field"><span>{tr("Meal")}</span>
            <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>{MEALS.map((m) => <option key={m.key} value={m.key}>{tr(m.label)}</option>)}</select>
          </label>
        </div>
        {food?.servings.length ? <div className="row wrap">{food.servings.map((sv) => <button key={tr(sv.label)} className="btn sm" onClick={() => setGrams(sv.grams)}>{tr(sv.label)}</button>)}</div> : null}
        <NutrientTable n={n} />
        <div className="row"><button className="btn danger" onClick={del}>{tr("Delete")}</button><button className="btn primary grow" onClick={save}>{tr("Save")}</button></div>
      </div>
    </Sheet>
  );
}

function MyFoods({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useAppState();
  return (
    <Sheet open={open} onClose={onClose} title={tr("My foods & recipes")}>
      {s.foods.length === 0 && <div className="empty">{tr("Foods you create, scan, favorite or build as recipes show up here.")}</div>}
      {s.foods.map((f) => (
        <div key={f.id} className="list-item">
          <div className="grow">
            <div className="small">{trs(f.name)} {trs(f.favorite && '★')} <span className="pill">{trs(f.source === 'off' ? tr("scanned/online") : f.source)}</span></div>
            <div className="tiny muted">{fmt(f.per100.kcal)}{' '}{tr("kcal / 100 g")}{trs(f.ingredients ? tr(" · {v0} ingredients", { v0: f.ingredients.length }) : '')}</div>
          </div>
          <button className="icon-btn" title={tr("Remove")} onClick={async () => (await askConfirm(`Remove “${f.name}”? Logged entries are kept.`, tr("Remove"))) && mutate((st) => { st.foods = st.foods.filter((x) => x.id !== f.id); })}>🗑</button>
        </div>
      ))}
    </Sheet>
  );
}
