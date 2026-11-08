import { useState } from 'react';
import type { FoodEntry, Meal } from '../types';
import { MEALS, NUTRIENTS } from '../types';
import { mutate, useAppState } from '../lib/storage';
import { dailyTargets, entriesFor, findFood, isTrainingDay, microTargets, scale, sum } from '../lib/nutrition';
import { addDays, fmt, prettyDate, today, uid } from '../lib/util';
import { Bar, NumField, Ring, Seg, Sheet } from '../components/ui';
import { FoodPicker, NutrientTable } from '../components/FoodPicker';
import { askConfirm } from '../components/confirm';

export function DateNav({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  return (
    <div className="row">
      <button className="btn sm" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
      <button className="btn sm" style={{ minWidth: 120 }} onClick={() => setDate(today())}>{prettyDate(date)}</button>
      <button className="btn sm" onClick={() => setDate(addDays(date, 1))} disabled={date >= today()} aria-label="Next day">›</button>
    </div>
  );
}

export function MacroSummary({ date }: { date: string }) {
  const s = useAppState();
  const t = dailyTargets(s.profile, isTrainingDay(s, date));
  const n = sum(entriesFor(s, date).map((e) => e.nutrients));
  const left = t.kcal - (n.kcal ?? 0);
  const macros = [
    { k: 'protein' as const, label: 'Protein', color: 'var(--protein)', target: t.protein },
    { k: 'carbs' as const, label: 'Carbs', color: 'var(--carbs)', target: t.carbs },
    { k: 'fat' as const, label: 'Fat', color: 'var(--fat)', target: t.fat },
  ];
  return (
    <div className="row" style={{ gap: 18, alignItems: 'center' }}>
      <Ring value={n.kcal ?? 0} max={t.kcal} label={fmt(Math.abs(left))} sub={left >= 0 ? 'kcal left' : 'kcal over'} />
      <div className="grow stack">
        {macros.map((m) => (
          <div key={m.k}>
            <div className="row between small"><span>{m.label}</span><span className="num muted">{fmt(n[m.k])} / {m.target} g</span></div>
            <Bar value={n[m.k] ?? 0} max={m.target} color={m.color} />
          </div>
        ))}
        <div className="tiny muted">{fmt(n.kcal)} / {t.kcal} kcal {t.trainingDay ? <span className="pill accent">training day +{s.profile.trainingDayKcal}</span> : <span className="pill">rest day</span>}</div>
      </div>
    </div>
  );
}

export function WaterCard({ date }: { date: string }) {
  const s = useAppState();
  const ml = s.water[date] ?? 0;
  const add = (d: number) => mutate((st) => { st.water[date] = Math.max(0, (st.water[date] ?? 0) + d); });
  return (
    <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>💧 Water</h2><span className="num muted small">{fmt(ml / 1000, 2)} / {fmt(s.profile.waterGoalMl / 1000, 1)} L</span></div>
      <div style={{ margin: '10px 0' }}><Bar value={ml} max={s.profile.waterGoalMl} color="var(--protein)" /></div>
      <div className="row wrap">
        <button className="btn sm" onClick={() => add(250)}>+250 ml</button>
        <button className="btn sm" onClick={() => add(500)}>+500 ml</button>
        <button className="btn sm" onClick={() => add(750)}>+750 ml</button>
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
  const entries = entriesFor(s, date);
  const yesterday = entriesFor(s, addDays(date, -1));
  const totals = sum(entries.map((e) => e.nutrients));
  const t = dailyTargets(s.profile, isTrainingDay(s, date));
  const micro = microTargets(s.profile, t.kcal);

  const copyYesterday = () => mutate((st) => { yesterday.forEach((e) => st.entries.push({ ...e, id: uid(), date })); });

  return (
    <div>
      <div className="page-head"><h1>Diet</h1><DateNav date={date} setDate={setDate} /></div>
      <div className="card"><MacroSummary date={date} /></div>
      <div style={{ marginBottom: 14 }}>
        <Seg value={view} onChange={setView} options={[{ value: 'log', label: 'Food log' }, { value: 'nutrients', label: 'Vitamins & minerals' }]} />
      </div>

      {view === 'log' ? (
        <>
          {entries.length === 0 && yesterday.length > 0 && (
            <button className="btn block" style={{ marginBottom: 14 }} onClick={copyYesterday}>Copy {yesterday.length} items from the day before</button>
          )}
          {MEALS.map((m) => {
            const list = entries.filter((e) => e.meal === m.key);
            const kcal = list.reduce((a, e) => a + (e.nutrients.kcal ?? 0), 0);
            return (
              <div className="card" key={m.key}>
                <div className="row between">
                  <h2 style={{ margin: 0 }}>{m.label} <span className="muted small num">{kcal ? `${fmt(kcal)} kcal` : ''}</span></h2>
                  <button className="btn sm primary" onClick={() => setPicker(m.key)}>+ Add</button>
                </div>
                {list.length > 0 && <div style={{ marginTop: 8 }}>
                  {list.map((e) => (
                    <div key={e.id} className="list-item click" onClick={() => setEditing(e)}>
                      <div className="grow">
                        <div className="small">{e.name}</div>
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
          <button className="btn block ghost" onClick={() => setMyFoods(true)}>Manage my foods & recipes</button>
        </>
      ) : (
        <div className="card">
          <h2>Daily nutrients</h2>
          <p className="tiny muted" style={{ marginBottom: 10 }}>Based on general adult reference values. Built-in foods have full data; some online products only list macros, so micronutrients can read low.</p>
          {NUTRIENTS.slice(4).map(({ key, label, unit }) => {
            const target = micro[key];
            const v = totals[key] ?? 0;
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <div className="row between small">
                  <span>{label} {target?.limit && <span className="pill">limit</span>}</span>
                  <span className="num muted">{fmt(v, v < 10 ? 1 : 0)} / {target ? fmt(target.value, target.value < 10 ? 1 : 0) : '–'} {unit}</span>
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
    <Sheet open onClose={onClose} title={entry.name}>
      <div className="stack">
        <div className="grid2">
          <NumField label="Amount" suffix="g" value={grams} onChange={setGrams} />
          <label className="field"><span>Meal</span>
            <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>{MEALS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
          </label>
        </div>
        {food?.servings.length ? <div className="row wrap">{food.servings.map((sv) => <button key={sv.label} className="btn sm" onClick={() => setGrams(sv.grams)}>{sv.label}</button>)}</div> : null}
        <NutrientTable n={n} />
        <div className="row"><button className="btn danger" onClick={del}>Delete</button><button className="btn primary grow" onClick={save}>Save</button></div>
      </div>
    </Sheet>
  );
}

function MyFoods({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useAppState();
  return (
    <Sheet open={open} onClose={onClose} title="My foods & recipes">
      {s.foods.length === 0 && <div className="empty">Foods you create, scan, favorite or build as recipes show up here.</div>}
      {s.foods.map((f) => (
        <div key={f.id} className="list-item">
          <div className="grow">
            <div className="small">{f.name} {f.favorite && '★'} <span className="pill">{f.source === 'off' ? 'scanned/online' : f.source}</span></div>
            <div className="tiny muted">{fmt(f.per100.kcal)} kcal / 100 g{f.ingredients ? ` · ${f.ingredients.length} ingredients` : ''}</div>
          </div>
          <button className="icon-btn" title="Remove" onClick={async () => (await askConfirm(`Remove “${f.name}”? Logged entries are kept.`, 'Remove')) && mutate((st) => { st.foods = st.foods.filter((x) => x.id !== f.id); })}>🗑</button>
        </div>
      ))}
    </Sheet>
  );
}
