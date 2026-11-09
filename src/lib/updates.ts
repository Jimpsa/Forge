// Over-the-air updates for the Android app (no reinstall needed for normal changes).
// CI publishes version.json + a zipped web bundle to GitHub Pages; the app downloads it in the
// background and switches to it on the next start (or immediately if the user taps "Restart").
import { useSyncExternalStore } from 'react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { App } from '@capacitor/app';
import { APP_BUILD, IS_NATIVE, UPDATE_BASE } from './app';

export type UpdateState =
  | { status: 'idle' | 'checking' | 'latest' | 'unsupported' }
  | { status: 'downloading'; version: string }
  | { status: 'ready'; version: string; id: string; notes?: string }
  | { status: 'native-required'; version: string }
  | { status: 'error'; message: string };

let state: UpdateState = { status: IS_NATIVE ? 'idle' : 'unsupported' };
const listeners = new Set<() => void>();
const setState = (s: UpdateState) => { state = s; listeners.forEach((l) => l()); };
export const useUpdateState = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);

/** Must be called on every start, or the updater rolls back to the previous bundle (crash protection). */
export async function initUpdates() {
  if (!IS_NATIVE) return;
  try { await CapacitorUpdater.notifyAppReady(); } catch { /* plugin unavailable */ }
  checkForUpdate(true);
}

export async function checkForUpdate(silent = false) {
  if (!IS_NATIVE || state.status === 'downloading') return;
  if (!silent) setState({ status: 'checking' });
  try {
    const res = await fetch(`${UPDATE_BASE}/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info: { version: string; build: number; url: string; notes?: string; minNativeBuild?: number } = await res.json();
    if (!(info.build > APP_BUILD)) { setState({ status: silent ? 'idle' : 'latest' }); return; }
    const nativeBuild = Number((await App.getInfo()).build) || 0;
    if (info.minNativeBuild && nativeBuild < info.minNativeBuild) { setState({ status: 'native-required', version: info.version }); return; }
    setState({ status: 'downloading', version: info.version });
    const bundle = await CapacitorUpdater.download({ url: info.url, version: info.version });
    await CapacitorUpdater.next({ id: bundle.id }); // applied automatically on next app start
    setState({ status: 'ready', version: info.version, id: bundle.id, notes: info.notes });
  } catch (e) {
    setState(silent ? { status: 'idle' } : { status: 'error', message: (e as Error).message || 'Update check failed' });
  }
}

export async function applyUpdateNow() {
  if (state.status === 'ready') await CapacitorUpdater.set({ id: state.id }); // reloads the app
}
