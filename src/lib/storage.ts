// Single source of truth for app data. Everything is persisted to localStorage today.
// To go multi-user/commercial later, swap `persist`/`load` for a backend (e.g. Supabase/Postgres)
// — the rest of the app only talks to `useAppState` and `mutate`.
import { useSyncExternalStore } from 'react';
import type { AppState } from '../types';
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

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch { /* corrupted or unavailable storage – start fresh */ }
  return defaultState();
}

let state: AppState = load();
const listeners = new Set<() => void>();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Could not save', e); }
}

export const getState = () => state;

/** Apply an update to a copy of the state, then save and notify. */
export function mutate(fn: (draft: AppState) => void) {
  const next = structuredClone(state);
  fn(next);
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function replaceState(next: AppState) { state = { ...defaultState(), ...next }; persist(); listeners.forEach((l) => l()); }

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useAppState = () => useSyncExternalStore(subscribe, getState);

export function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `forge-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
