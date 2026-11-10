import { trs } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import type { Meal, PlannedDay, PlannedMeal } from '../types';
import { mutate, useAppState } from '../lib/storage';
import { STYLES, buildMealPlan, dayTarget, dayTotals, microCoverage, netCarbs, portionLabel, shoppingList, type DietStyle, type PlanInputs, type TrainTime } from '../lib/mealplan';
import { findFood, scale } from '../lib/nutrition';
import { celebrate, haptic } from '../lib/fx';
import { fmt, today, uid } from '../lib/util';
import { Bar, Seg, Sheet } from '../components/ui';
import { askConfirm } from '../components/confirm';
import { shareText } from '../components/Rewards';
import { PrepCard } from '../components/Prep';
import { toast } from '../components/Toast';
import { PHASES, prepItems, protocolPlanKey } from '../lib/protocol';
import { getState } from '../lib/storage';
import { tr } from '../i18n';

/** Keeps a gut-reset meal plan in step with the protocol: rebuilds it when the phase, tests or yogurt step change. */
export function useProtocolPlanSync() {
  const s = useAppState();
  const key = protocolPlanKey(s);
  useEffect(() => {
    const plan = s.mealPlan;
    if (!plan || plan.style !== 'protocol' || !s.protocol || plan.protocolKey === key) return;
    const inputs = plan.inputs ?? { meals: 4 as const, trainTime: 'evening' as const, seed: 0 };
    const fresh = buildMealPlan(getState(), { style: 'protocol', ...inputs });
    const phaseChanged = plan.protocolKey && plan.protocolKey.split('|')[0] !== String(s.protocol.phase);
    mutate((st) => { st.mealPlan = { ...plan, days: fresh.days, notes: fresh.notes, protocolKey: key }; });
    if (plan.protocolKey) toast({ title: tr("Meal plan updated"), sub: phaseChanged ? `Now following ${PHASES[s.protocol.phase].name}.` : 'Your gut-reset foods changed, so the menu was rebuilt.' });
  }, [key, s.mealPlan?.style]); // eslint-disable-line react-hooks/exhaustive-deps
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const todayWeekday = () => WEEKDAYS[(new Date().getDay() + 6) % 7];
const slotToMeal = (slot: string): Meal => (/breakfast/i.test(slot) ? 'breakfast' : /lunch/i.test(slot) ? 'lunch' : /dinner/i.test(slot) ? 'dinner' : 'snacks');

function logMeal(m: PlannedMeal) {
  mutate((st) => {
    for (const x of m.items) {
      const f = findFood(st, x.foodId);
      if (f) st.entries.push({ id: uid(), date: today(), meal: slotToMeal(m.slot), foodId: f.id, name: f.name, grams: x.grams, nutrients: scale(f.per100, x.grams) });
    }
  });
  haptic('tap');
}

function MealCard({ m, onLog, logged }: { m: PlannedMeal; onLog?: () => void; logged?: boolean }) {
  const n = useMemo(() => dayTotals({ weekday: '', training: false, meals: [m] }), [m]);
  return (
    <div className="list-item" style={{ display: 'block' }}>
      <div className="row between">
        <div><div className="tiny muted">{trs(m.slot)}</div><strong className="small">{trs(m.title)}</strong></div>
        {onLog && (logged ? <span className="pill accent">{tr("Logged ✓")}</span> : <button className="btn sm" onClick={onLog}>{tr("Log")}</button>)}
      </div>
      <div className="tiny muted" style={{ marginTop: 3 }}>{trs(m.items.map((x) => `${x.test ? '🧪 ' : ''}${trs(x.name).split(',')[0]} ${portionLabel(x.name, x.grams)}${x.test ? tr(' (test portion)') : ''}`).join(' · '))}</div>
      <div className="tiny" style={{ marginTop: 2 }}>{fmt(n.kcal)}{' '}{tr("kcal · P")}{' '}{fmt(n.protein)} · C {fmt(n.carbs)} · F {fmt(n.fat)}</div>
    </div>
  );
}

export function MealPlanCard({ onBuild }: { onBuild: () => void }) {
  const s = useAppState();
  const plan = s.mealPlan;
  const [loggedSlots, setLogged] = useState<string[]>([]);
  if (!plan) {
    return (
      <div className="card" style={{ borderColor: 'var(--accent)' }}>
        <h2 style={{ marginBottom: 4 }}>{tr("Build my meal plan")}</h2>
        <p className="small muted">{tr("Pick a diet style (balanced, vegetarian, vegan, keto, carnivore, gut reset…) and get a nutrient-dense week that hits your targets and follows your training days.")}</p>
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={onBuild}>{tr("Design my meal plan")}</button>
      </div>
    );
  }
  const day = plan.days.find((d) => d.weekday === todayWeekday()) ?? plan.days[0];
  const style = STYLES.find((x) => x.key === plan.style);
  return (
    <>
    {plan.style === 'protocol' && <PrepCard compact />}
    <div className="card" style={{ borderColor: 'var(--accent)' }}>
      <div className="row between">
        <div><div className="tiny muted">{tr("Meal plan ·")}{' '}{trs(style?.label)} · {trs(day.weekday)}</div><h2 style={{ margin: '2px 0' }}>{trs(day.training ? tr("Training day") : tr("Rest day"))}{' '}{tr("menu")}</h2></div>
        <button className="btn sm" onClick={onBuild}>{tr("Week")}</button>
      </div>
      {day.meals.map((m, i) => <MealCard key={i} m={m} logged={loggedSlots.includes(m.slot)} onLog={() => { logMeal(m); setLogged((x) => [...x, m.slot]); }} />)}
    </div>
    </>
  );
}

export function MealPlanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useAppState();
  const [inp, setInp] = useState<PlanInputs>({ style: (s.mealPlan?.style as DietStyle) ?? (s.protocol && s.protocol.phase < 3 ? 'protocol' : 'balanced'), meals: 4, trainTime: 'evening', seed: 0 });
  const [dayIdx, setDayIdx] = useState(Math.max(0, WEEKDAYS.indexOf(todayWeekday())));
  const [shop, setShop] = useState(false);
  const set = (p: Partial<PlanInputs>) => setInp((x) => ({ ...x, ...p }));
  const fresh = useMemo(() => buildMealPlan(s, inp), [s.profile, s.program, s.protocol, inp]); // eslint-disable-line react-hooks/exhaustive-deps
  const days: PlannedDay[] = fresh.days;
  const day = days[dayIdx];
  const tot = dayTotals(day);
  const tgt = dayTarget(s, inp.style, day.training);
  const micros = useMemo(() => microCoverage(s, days), [days]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => shoppingList(days), [days]);
  const styles = STYLES;

  const save = async () => {
    if (s.mealPlan && !(await askConfirm(tr("Replace your current meal plan?"), tr("Replace")))) return;
    mutate((st) => { st.mealPlan = { id: uid(), style: inp.style, createdAt: today(), days, notes: fresh.notes, inputs: { meals: inp.meals, trainTime: inp.trainTime, seed: inp.seed }, protocolKey: inp.style === 'protocol' ? protocolPlanKey(st) : undefined }; });
    celebrate(null, 60);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={tr("Design my meal plan")}>
      <div className="stack">
        <div>
          <div className="small" style={{ marginBottom: 6 }}>{tr("Diet style")}</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {styles.map((x) => <button key={x.key} type="button" className={'btn sm' + (inp.style === x.key ? ' primary' : '')} onClick={() => set({ style: x.key })}>{tr(x.label)}</button>)}
          </div>
          <p className="tiny muted" style={{ marginTop: 6 }}>{trs(STYLES.find((x) => x.key === inp.style)?.blurb)}</p>
          {inp.style === 'protocol' && !s.protocol && (
            <div className="card flat" style={{ marginTop: 8, borderColor: 'var(--accent-2)' }}>
              <p className="small">{tr("You haven’t started the gut reset yet. Start it today in Phase 1 (meat, eggs, animal fats, fresh white rice and peeled potatoes), and the plan will follow every phase from here.")}</p>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn sm primary grow" onClick={() => mutate((st) => { st.protocol = { start: today(), phase: 1, phaseStart: today(), raw: false, tests: [] }; })}>{tr("Start · cooked route")}</button>
                <button className="btn sm grow" onClick={() => mutate((st) => { st.protocol = { start: today(), phase: 1, phaseStart: today(), raw: true, tests: [] }; })}>{tr("Start · raw route")}</button>
              </div>
              <p className="tiny muted" style={{ marginTop: 6 }}>{tr("Already on it? Set your real start date and phase in Coach → Reset.")}</p>
            </div>
          )}
          {inp.style === 'protocol' && s.protocol && <p className="tiny" style={{ marginTop: 6 }}>{tr("Following")}{' '}{trs(PHASES[s.protocol.phase].name)}{tr(". The plan updates by itself when your phase or tested foods change.")}</p>}
        </div>
        <div className="grid2">
          <div><div className="small" style={{ marginBottom: 4 }}>{tr("Meals per day")}</div>
            <Seg value={String(inp.meals)} onChange={(v) => set({ meals: +v as 3 | 4 | 5 })} options={[{ value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }]} /></div>
          <div><div className="small" style={{ marginBottom: 4 }}>{tr("I usually train")}</div>
            <Seg value={inp.trainTime} onChange={(v: TrainTime) => set({ trainTime: v })} options={[{ value: 'morning', label: tr("AM") }, { value: 'midday', label: tr("Noon") }, { value: 'evening', label: tr("PM") }]} /></div>
        </div>
        <p className="tiny muted">{trs(s.program ? tr("Training days from your program: {v0}.", { v0: s.program.weekdays.join(', ') }) : tr("No training program yet, so Mon, Wed and Fri are treated as training days."))}{' '}{tr("Targets come from your profile (")}{trs(s.profile.goal === 'cut' ? tr("fat loss") : s.profile.goal === 'bulk' ? tr("muscle gain") : tr("maintenance"))}).</p>

        <div className="card" style={{ margin: 0, background: 'var(--bg)' }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{tr("Preview")}</h2>
            <button className="btn sm" onClick={() => set({ seed: inp.seed + 1 })}>{tr("Shuffle")}</button>
          </div>
          <div className="row" style={{ gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
            {days.map((d, i) => (
              <button key={d.weekday} type="button" className={'btn sm' + (i === dayIdx ? ' primary' : '')} style={{ flex: '1 0 auto', padding: '6px 8px' }} onClick={() => setDayIdx(i)}>
                {trs(d.weekday)}{trs(d.training ? ' 🏋' : '')}
              </button>
            ))}
          </div>
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="tiny muted">{trs(day.training ? tr("Training day: more carbs, pre-workout snack, protein-rich meal after.") : tr("Rest day: fewer carbs, same protein."))}</div>
            {[
              { l: 'Calories', v: tot.kcal ?? 0, t: tgt.kcal, c: 'var(--accent)', u: 'kcal' },
              { l: 'Protein', v: tot.protein ?? 0, t: tgt.protein, c: 'var(--protein)', u: 'g' },
              { l: inp.style === 'keto' ? 'Net carbs' : 'Carbs', v: inp.style === 'keto' ? netCarbs(tot) : tot.carbs ?? 0, t: tgt.carbs, c: 'var(--carbs)', u: 'g' },
              { l: 'Fat', v: tot.fat ?? 0, t: tgt.fat, c: 'var(--fat)', u: 'g' },
            ].map((x) => (
              <div key={x.l}><div className="row between tiny"><span>{trs(x.l)}</span><span className="num muted">{fmt(x.v)} / {fmt(x.t)} {trs(x.u)}</span></div><Bar value={x.v} max={x.t} color={x.c} limit={x.l.includes('arbs') && inp.style === 'keto'} /></div>
            ))}
          </div>
          <div style={{ marginTop: 6 }}>{day.meals.map((m, i) => <MealCard key={i} m={m} />)}</div>

          <h3 style={{ marginTop: 14 }}>{tr("Vitamins & minerals (weekly average)")}</h3>
          <div className="grid2" style={{ gap: 6 }}>
            {micros.map((x) => (
              <div key={x.key}><div className="row between tiny"><span>{tr(x.label)}</span><span className="num" style={{ color: x.pct < 70 ? 'var(--warn)' : 'var(--muted)' }}>{x.pct}%</span></div><Bar value={x.pct} max={100} color={x.pct < 70 ? 'var(--warn)' : 'var(--good)'} /></div>
            ))}
          </div>

          <h3 style={{ marginTop: 14 }}>{tr("Good to know")}</h3>
          <ul className="small" style={{ paddingLeft: 18, marginTop: 4 }}>{fresh.notes.map((n) => <li key={n} style={{ marginTop: 4 }}>{trs(n)}</li>)}</ul>

          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setShop(!shop)}>{trs(shop ? tr("Hide") : tr("Show"))}{' '}{tr("shopping list for the week")}</button>
          {shop && (
            <div style={{ marginTop: 8 }}>
              {inp.style === 'protocol' && prepItems(s).length > 0 && <div className="tiny" style={{ margin: '4px 0 6px', color: 'var(--accent-2)' }}>{tr("Coming up soon:")}{' '}{trs(prepItems(s).flatMap((x) => x.buy).join(', '))}</div>}
              {list.map((x) => <div key={x.name} className="row between small" style={{ padding: '3px 0' }}><span>{trs(x.name)}</span><span className="num muted">{trs(x.grams >= 1000 ? tr("{v0} kg", { v0: fmt(x.grams / 1000, 1) }) : `${fmt(x.grams)} g`)}</span></div>)}
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => shareText('Forge shopping list', list.map((x) => `• ${x.name}: ${x.grams >= 1000 ? `${fmt(x.grams / 1000, 1)} kg` : `${fmt(x.grams)} g`}`).join('\n'))}>{tr("Share / copy list")}</button>
            </div>
          )}
        </div>
        <button className="btn primary block" onClick={save}>{tr("Save meal plan")}</button>
        {s.mealPlan && <button className="btn ghost block danger" onClick={async () => { if (await askConfirm(tr("Remove your meal plan?"), tr("Remove"))) { mutate((st) => { st.mealPlan = undefined; }); onClose(); } }}>{tr("Remove current plan")}</button>}
        <p className="tiny muted">{tr("Portions are estimates from reference values. Weigh foods the first few times; your weight trend in the Coach tab shows whether the calories are right for you.")}</p>
      </div>
    </Sheet>
  );
}
