import type { AppState, Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = { palette: 'ember', mode: 'dark', celebrations: true, vibration: true, sounds: false, motion: 'system' };
export const settingsOf = (s: AppState): Settings => ({ ...DEFAULT_SETTINGS, ...s.settings });

/** Apply theme + motion preferences to <html> so CSS can react. */
export function applySettings(st: Settings) {
  const el = document.documentElement;
  el.dataset.palette = st.palette;
  el.dataset.mode = st.mode;
  const reduce = st.motion === 'reduce' || (st.motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  el.classList.toggle('calm', reduce);
  const dark = st.mode === 'dark' || (st.mode === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? (st.palette === 'ember' ? '#121014' : '#0e1116') : '#f6f2ef');
}
