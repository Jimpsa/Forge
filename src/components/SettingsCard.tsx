import type { Settings } from '../types';
import { mutate, useAppState } from '../lib/storage';
import { settingsOf } from '../lib/settings';
import { celebrate, haptic } from '../lib/fx';
import { Seg } from './ui';

export function SettingsCard() {
  const s = useAppState();
  const st = settingsOf(s);
  const set = (patch: Partial<Settings>) => mutate((x) => { x.settings = { ...settingsOf(x), ...patch }; });
  const Toggle = ({ k, label, hint }: { k: 'celebrations' | 'vibration' | 'sounds'; label: string; hint?: string }) => (
    <label className="setting-row" htmlFor={`set-${k}`}>
      <span><span>{label}</span>{hint && <span className="tiny muted" style={{ display: 'block' }}>{hint}</span>}</span>
      <span className="switch"><input id={`set-${k}`} type="checkbox" checked={st[k]} onChange={(e) => { set({ [k]: e.target.checked }); if (e.target.checked && k === 'vibration') setTimeout(() => haptic('tap'), 50); }} /><span /></span>
    </label>
  );
  return (
    <div className="card">
      <h2>Look & feel</h2>
      <div className="stack">
        <div><div className="small" style={{ marginBottom: 4 }}>Colours</div>
          <Seg value={st.palette} onChange={(v) => set({ palette: v })} options={[{ value: 'ember', label: 'Ember' }, { value: 'green', label: 'Green' }]} /></div>
        <div><div className="small" style={{ marginBottom: 4 }}>Theme</div>
          <Seg value={st.mode} onChange={(v) => set({ mode: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Follow phone' }]} /></div>
        <div><div className="small" style={{ marginBottom: 4 }}>Motion</div>
          <Seg value={st.motion} onChange={(v) => set({ motion: v })} options={[{ value: 'system', label: 'Follow phone' }, { value: 'full', label: 'Full' }, { value: 'reduce', label: 'Reduced' }]} /></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Toggle k="celebrations" label="Celebrations & confetti" hint="PRs, badges, perfect days" />
        <Toggle k="vibration" label="Vibration" hint="Light ticks and success buzzes" />
        <Toggle k="sounds" label="Sounds" hint="Short, quiet chimes" />
      </div>
      <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={(e) => celebrate(e.currentTarget, 60)}>Try a celebration 🎉</button>
    </div>
  );
}
