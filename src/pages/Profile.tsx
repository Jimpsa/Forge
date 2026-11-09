import { useRef, useState } from 'react';
import type { Profile as P } from '../types';
import { defaultState, exportJson, mutate, replaceState, useAppState, useSyncStatus } from '../lib/storage';
import { IS_ARTIFACT } from '../lib/env';
import { AppInfoCard } from '../components/AppInfo';
import { SettingsCard } from '../components/SettingsCard';
import { LegalCard } from '../components/Legal';
import { ACTIVITY_FACTORS, bmr, dailyTargets, tdee } from '../lib/nutrition';
import { fmt, today } from '../lib/util';
import { NumField, Seg, Stat } from '../components/ui';
import { askConfirm, notify } from '../components/confirm';

export function ProfileForm({ onboarding }: { onboarding?: boolean }) {
  const s = useAppState();
  const [p, setP] = useState<P>(s.profile);
  const set = <K extends keyof P>(k: K, v: P[K]) => setP((x) => ({ ...x, [k]: v }));
  const rest = dailyTargets(p, false), train = dailyTargets(p, true);
  const [saved, setSaved] = useState(false);

  const save = () => {
    mutate((st) => {
      st.profile = p;
      st.onboarded = true;
      if (!st.body.length) st.body.push({ date: today(), weightKg: p.weightKg });
    });
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <div className="card stack">
        <h2>About you</h2>
        <label className="field"><span>Name</span><input value={p.name} onChange={(e) => set('name', e.target.value)} /></label>
        <Seg value={p.sex} onChange={(v) => set('sex', v)} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        <div className="grid3">
          <NumField required label="Birth year" value={p.birthYear} onChange={(v) => set('birthYear', v ?? 1990)} />
          <NumField required label="Height" suffix="cm" value={p.heightCm} onChange={(v) => set('heightCm', v ?? 0)} />
          <NumField required label="Weight" suffix="kg" value={p.weightKg} onChange={(v) => set('weightKg', v ?? 0)} step={0.1} />
        </div>
        {p.sex === 'female' && (
          <div className="stack" style={{ padding: 12, borderRadius: 12, background: 'var(--surface-2)' }}>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={!!p.cycle?.track} onChange={(e) => set('cycle', { contraception: 'none', typicalLength: 28, ...p.cycle, track: e.target.checked })} />
              Track my menstrual cycle (adjusts training advice to symptoms)
            </label>
            {p.cycle?.track && (
              <div className="grid2">
                <label className="field"><span>Contraception</span>
                  <select value={p.cycle.contraception} onChange={(e) => set('cycle', { ...p.cycle!, contraception: e.target.value as 'none' | 'hormonal' })}>
                    <option value="none">None / copper IUD</option>
                    <option value="hormonal">Hormonal (pill, implant, hormonal IUD…)</option>
                  </select>
                </label>
                <NumField required label="Typical cycle length" suffix="days" value={p.cycle.typicalLength} onChange={(v) => set('cycle', { ...p.cycle!, typicalLength: v ?? 28 })} />
              </div>
            )}
            <p className="tiny muted">Private to you. Cycle data is only used for your own training advice.</p>
          </div>
        )}
        <label className="field"><span>Daily activity outside of training</span>
          <select value={p.activity} onChange={(e) => set('activity', e.target.value as P['activity'])}>
            {Object.entries(ACTIVITY_FACTORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>

      <div className="card stack">
        <h2>Goal</h2>
        <Seg value={p.goal} onChange={(v) => set('goal', v)} options={[{ value: 'cut', label: 'Lose fat' }, { value: 'maintain', label: 'Maintain' }, { value: 'bulk', label: 'Build muscle' }]} />
        {p.goal !== 'maintain' && (
          <label className="field"><span>Rate: {p.rateKgPerWeek} kg / week</span>
            <input type="range" min={0.1} max={1} step={0.05} value={p.rateKgPerWeek} onChange={(e) => set('rateKgPerWeek', +e.target.value)} style={{ padding: 0 }} />
          </label>
        )}
        <details>
          <summary className="small muted" style={{ cursor: 'pointer' }}>Advanced targets</summary>
          <div className="grid2" style={{ marginTop: 10 }}>
            <NumField required label="Protein" suffix="g per kg" value={p.proteinPerKg} onChange={(v) => set('proteinPerKg', v ?? 2)} step={0.1} />
            <NumField required label="Fat" suffix="% of kcal" value={p.fatPct} onChange={(v) => set('fatPct', v ?? 27)} />
            <NumField required label="Extra on training days" suffix="kcal" value={p.trainingDayKcal} onChange={(v) => set('trainingDayKcal', v ?? 0)} step={50} />
            <NumField required label="Water goal" suffix="ml" value={p.waterGoalMl} onChange={(v) => set('waterGoalMl', v ?? 3000)} step={250} />
            <NumField label="Max heart rate" suffix="bpm" value={p.maxHr} onChange={(v) => set('maxHr', v)} />
            <NumField label="Fixed calorie target" suffix="kcal, optional" value={p.kcalOverride} onChange={(v) => set('kcalOverride', v)} step={50} />
          </div>
        </details>
      </div>

      <div className="card">
        <h2>Your daily targets</h2>
        <div className="grid2">
          <div className="stat"><div className="l">Rest day</div><div className="v">{fmt(rest.kcal)} kcal</div><div className="tiny muted">P {rest.protein} · C {rest.carbs} · F {rest.fat} g</div></div>
          <div className="stat"><div className="l">Training day</div><div className="v">{fmt(train.kcal)} kcal</div><div className="tiny muted">P {train.protein} · C {train.carbs} · F {train.fat} g</div></div>
        </div>
        {p.maintenanceKcal ? (
          <p className="tiny muted" style={{ marginTop: 8 }}>Using your <strong>measured maintenance</strong> of {fmt(p.maintenanceKcal)} kcal (from your intake + weight trend; formula says {fmt(tdee(p))}).{' '}
            <button className="btn sm ghost" onClick={() => set('maintenanceKcal', undefined)}>Use formula instead</button></p>
        ) : (
          <p className="tiny muted" style={{ marginTop: 8 }}>BMR {fmt(bmr(p))} kcal (Mifflin–St Jeor) · maintenance ≈ {fmt(tdee(p))} kcal. Formulas are ±10% for most people — after 2–4 weeks of logging and weigh-ins, the Coach tab measures your real maintenance.</p>
        )}
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={save}>{onboarding ? 'Get started' : saved ? 'Saved ✓' : 'Save profile'}</button>
      </div>
    </>
  );
}

export function Profile() {
  const s = useAppState();
  const file = useRef<HTMLInputElement>(null);
  const sync = useSyncStatus();
  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data.version !== 1 || !data.profile) throw new Error('bad file');
      if (await askConfirm('Replace all current data with this backup?', 'Replace')) replaceState(data);
    } catch { notify('That file is not a valid Forge backup.'); }
  };
  return (
    <div>
      <div className="page-head"><h1>Profile</h1></div>
      <ProfileForm />
      <div className="card">
        <h2>Your data</h2>
        <div className="grid3" style={{ marginBottom: 12 }}>
          <Stat v={s.entries.length} l="food entries" />
          <Stat v={s.sessions.length} l="workouts" />
          <Stat v={s.body.length} l="weigh-ins" />
        </div>
        <p className="small muted">
          {sync.status === 'cloud' || sync.status === 'saving' ? `☁️ ${sync.status === 'saving' ? 'Saving…' : 'Saved'} to your account, privately — only you can see it, on any device where you open this page.`
            : sync.status === 'error' ? `⚠️ ${sync.message}` : 'Your data is stored on this device only. Export a backup regularly, or to move to another phone.'}
        </p>
        <div className="grid2" style={{ marginTop: 10 }}>
          {!IS_ARTIFACT && <button className="btn" onClick={exportJson}>⬇ Export backup</button>}
          <button className="btn" onClick={() => file.current?.click()}>⬆ Import backup</button>
        </div>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        <button className="btn danger block ghost" style={{ marginTop: 10 }} onClick={async () => (await askConfirm('Delete ALL your data? This cannot be undone.', 'Delete everything')) && replaceState(defaultState())}>Delete all data</button>
      </div>
      <SettingsCard />
      <LegalCard />
      <AppInfoCard />
    </div>
  );
}
