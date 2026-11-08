// Single source of truth for app data.
// - Always cached in localStorage (when the browser allows it).
// - When hosted on claude.ai, also synced to the viewer's private cloud store (`connectRemote`).
// To move to your own backend later (e.g. Supabase/Postgres), replace `connectRemote`/`flush` —
// the rest of the app only talks to `useAppState` and `mutate`.
import { useSyncExternalStore } from 'react';
import type { AppState, FoodEntry, Session } from '../types';
import { DEFAULT_TEMPLATES } from '../data/exercises';

const KEY = 'forge.state.v1';

export const defaultState = (): AppState => ({
  version: 1,
  onboarded: false,
  profile: {
    name: '', sex: 'male', birthYear: 1990, heightCm: 180, weightKg: 80, activity: 'moderate', goal: 'maintain',
    rateKgPerWeek: 0.5, proteinPerKg: 2, fatPct: 27, trainingDayKcal: 200, waterGoalMl: 3000,
  },
  foods: [], entries: [], water: {}, exercises: [], templates: DEFAULT_TEMPLATES, sessions: [], body: [],
});

function loadLocal(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch { /* storage unavailable or corrupted – start fresh */ }
  return defaultState();
}

let state: AppState = loadLocal();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  scheduleRemote();
}

export const getState = () => state;

/** Apply an update to a copy of the state, then save and notify. */
export function mutate(fn: (draft: AppState) => void) {
  const next = structuredClone(state);
  fn(next);
  state = next;
  persist();
  emit();
}

export function replaceState(next: AppState) { state = { ...defaultState(), ...next }; persist(); emit(); }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useAppState = () => useSyncExternalStore(subscribe, getState);

export function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `forge-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------- Cloud sync (claude.ai hosted version) ----------------

export type SyncStatus = 'local' | 'loading' | 'cloud' | 'saving' | 'error';
let sync: { status: SyncStatus; message?: string } = { status: 'local' };
const setSync = (status: SyncStatus, message?: string) => { sync = { status, message }; emit(); };
export const useSyncStatus = () => useSyncExternalStore(subscribe, () => sync);

/* eslint-disable @typescript-eslint/no-explicit-any */
let col: any = null; // collection of this viewer's private docs; only set after a successful load
const lastSaved = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let writing = false, again = false;

/** Split into documents well under the 256 KiB doc limit: one core doc + one per month for logs. */
function split(s: AppState): Record<string, Record<string, unknown>> {
  const { entries, sessions, ...core } = s;
  const docs: Record<string, Record<string, unknown>> = { core };
  for (const e of entries) ((docs['entries-' + e.date.slice(0, 7)] ??= { items: [] }).items as FoodEntry[]).push(e);
  for (const x of sessions) ((docs['sessions-' + x.date.slice(0, 7)] ??= { items: [] }).items as Session[]).push(x);
  return docs;
}

function scheduleRemote() {
  if (!col) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 800);
}

async function flush() {
  if (!col) return;
  if (writing) { again = true; return; }
  writing = true;
  try {
    const docs = split(state);
    for (const [k, v] of Object.entries(docs)) {
      const json = JSON.stringify(v);
      if (lastSaved.get(k) === json) continue;
      if (sync.status !== 'saving') setSync('saving');
      await col.doc(k).set(JSON.parse(json));
      lastSaved.set(k, json);
    }
    for (const k of [...lastSaved.keys()]) if (!(k in docs)) { await col.doc(k).delete(); lastSaved.delete(k); }
    setSync('cloud');
  } catch (e: any) {
    const msg = e?.code === 'quota_exceeded' ? 'Cloud storage is full.' : e?.code === 'invalid_argument' ? 'You don’t have permission to save here.' : 'Could not save to the cloud — will retry.';
    setSync('error', msg);
    if (e?.code === 'unavailable' || !e?.code) setTimeout(scheduleRemote, 5000);
  } finally {
    writing = false;
    if (again) { again = false; flush(); }
  }
}

const timeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/** If running on claude.ai, load (or create) this viewer's private cloud copy. No-op elsewhere. */
export async function connectRemote() {
  // The host injects `claude.use`; wait briefly in case it appears after our script starts.
  let c: any;
  for (let i = 0; i < 20 && !(c = (window as any).claude)?.use; i++) await new Promise((r) => setTimeout(r, 100));
  if (!c?.use) return;
  setSync('loading');
  try {
    const [db, user] = await timeout(Promise.all([c.use('db'), c.use('user')]), 12000);
    const id = db && user ? await user.id() : null;
    if (!id) { setSync('error', 'Sign in to claude.ai to save your data to your account. Changes are kept on this device only.'); return; }
    const collection = db.collection('data/users/' + id);
    const snap: any = await timeout(collection.get(), 10000);
    if (!snap.empty) {
      let core: any = {}; const entries: FoodEntry[] = []; const sessions: Session[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        lastSaved.set(d.id, JSON.stringify(data));
        if (d.id === 'core') core = data;
        else if (d.id.startsWith('entries-')) entries.push(...(data.items ?? []));
        else if (d.id.startsWith('sessions-')) sessions.push(...(data.items ?? []));
      }
      state = { ...defaultState(), ...structuredClone(core), entries: structuredClone(entries), sessions: structuredClone(sessions) };
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
    }
    col = collection; // only now are writes allowed, so a failed load can never overwrite cloud data
    setSync('cloud');
    emit();
    if (snap.empty && state.onboarded) scheduleRemote(); // first visit: upload what's on this device
  } catch {
    setSync('error', 'Couldn’t reach your saved data. Changes are kept on this device only for now.');
  }
}
