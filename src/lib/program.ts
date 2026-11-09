// Helpers for the saved training program (next day, week number, deload).
import type { AppState } from '../types';
import { parseDate, today } from './util';

export function programInfo(s: AppState) {
  const p = s.program;
  if (!p) return undefined;
  const templates = p.templateIds.map((id) => s.templates.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
  if (!templates.length) return undefined;
  const names = templates.map((t) => t.name);
  const last = [...s.sessions].sort((a, b) => b.startedAt - a.startedAt).find((x) => names.includes(x.name));
  const nextIdx = last ? (names.indexOf(last.name) + 1) % templates.length : 0;
  const week = Math.floor((parseDate(today()).getTime() - parseDate(p.createdAt).getTime()) / (7 * 86400000)) + 1;
  const doneThisWeek = s.sessions.filter((x) => names.includes(x.name) && (parseDate(today()).getTime() - parseDate(x.date).getTime()) / 86400000 < ((new Date().getDay() + 6) % 7) + 1).length;
  return { program: p, templates, next: templates[nextIdx], nextIdx, week, deload: week % 6 === 0, doneThisWeek };
}
