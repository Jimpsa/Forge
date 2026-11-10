import { trs } from '../i18n';
import type { Settings } from '../types';
import { mutate, useAppState } from '../lib/storage';
import { settingsOf } from '../lib/settings';
import { celebrate, haptic } from '../lib/fx';
import { Seg } from './ui';
import { LANGS, tr } from '../i18n';

export function SettingsCard() {
  const s = useAppState();
  const st = settingsOf(s);
  const set = (patch: Partial<Settings>) => mutate((x) => { x.settings = { ...settingsOf(x), ...patch }; });
  const Toggle = ({ k, label, hint }: { k: 'celebrations' | 'vibration' | 'sounds'; label: string; hint?: string }) => (
    <label className="setting-row" htmlFor={tr("set-{v0}", { v0: k })}>
      <span><span>{trs(label)}</span>{hint && <span className="tiny muted" style={{ display: 'block' }}>{trs(hint)}</span>}</span>
      <span className="switch"><input id={tr("set-{v0}", { v0: k })} type="checkbox" checked={st[k]} onChange={(e) => { set({ [k]: e.target.checked }); if (e.target.checked && k === 'vibration') setTimeout(() => haptic('tap'), 50); }} /><span /></span>
    </label>
  );
  return (
    <div className="card">
      <h2>{tr("Look & feel")}</h2>
      <div className="stack">
        <div><div className="small" style={{ marginBottom: 4 }}>{tr("Language")}</div>
          <Seg value={st.lang ?? 'auto'} onChange={(v) => set({ lang: v as Settings['lang'] })} options={[{ value: 'auto', label: tr('Phone') }, ...LANGS.map((l) => ({ value: l.key, label: l.label }))]} /></div>
        <div><div className="small" style={{ marginBottom: 4 }}>{tr("Colours")}</div>
          <Seg value={st.palette} onChange={(v) => set({ palette: v })} options={[{ value: 'ember', label: tr("Ember") }, { value: 'green', label: tr("Green") }]} /></div>
        <div><div className="small" style={{ marginBottom: 4 }}>{tr("Theme")}</div>
          <Seg value={st.mode} onChange={(v) => set({ mode: v })} options={[{ value: 'dark', label: tr("Dark") }, { value: 'light', label: tr("Light") }, { value: 'system', label: tr("Follow phone") }]} /></div>
        <div><div className="small" style={{ marginBottom: 4 }}>{tr("Motion")}</div>
          <Seg value={st.motion} onChange={(v) => set({ motion: v })} options={[{ value: 'system', label: tr("Follow phone") }, { value: 'full', label: tr("Full") }, { value: 'reduce', label: tr("Reduced") }]} /></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Toggle k="celebrations" label={tr("Celebrations & confetti")} hint={tr("PRs, badges, perfect days")} />
        <Toggle k="vibration" label={tr("Vibration")} hint={tr("Light ticks and success buzzes")} />
        <Toggle k="sounds" label={tr("Sounds")} hint={tr("Short, quiet chimes")} />
      </div>
      <h3 style={{ marginTop: 12 }}>{tr("Health modes")}</h3>
      <div>
        <label className="setting-row" htmlFor="set-histamine">
          <span><span>{tr("Histamine-aware mode")}</span><span className="tiny muted" style={{ display: 'block' }}>{tr("Histamine ratings on foods, low-histamine meal plans, histamine symptoms in the check-in. Off if you have no histamine issues.")}</span></span>
          <span className="switch"><input id="set-histamine" type="checkbox" checked={!!st.histamine} onChange={(e) => set({ histamine: e.target.checked })} /><span /></span>
        </label>
      </div>
      <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={(e) => celebrate(e.currentTarget, 60)}>{tr("Try a celebration 🎉")}</button>
    </div>
  );
}
