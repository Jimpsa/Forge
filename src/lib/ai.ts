// AI coach. On claude.ai the page can ask Claude on the viewer's own account (the `sample` capability).
// Elsewhere this returns null; a commercial version would call the Claude API from your own backend.
import type { AppState, ChatMessage } from '../types';
import { analyze } from './coach';
import { gutPatterns, symptomScore, BRISTOL } from './gut';
import { age, dailyTargets } from './nutrition';
import { weeklySummaries, exerciseName, exerciseHistory } from './training';
import { addDays, today } from './util';
import { protocolContext } from './protocol';
import { readiness, progression } from './readiness';
import { cycleInfo } from './cycle';

/* eslint-disable @typescript-eslint/no-explicit-any */
type SampleFn = ((input: any, opts?: any) => Promise<{ text: string; truncated: boolean }>) | null;
let samplePromise: Promise<SampleFn> | undefined;

export function getSample(): Promise<SampleFn> {
  samplePromise ??= (async () => {
    const c = (window as any).claude;
    if (!c?.use) return null;
    try { return (await c.use('sample')) ?? null; } catch { return null; }
  })();
  return samplePromise;
}

const RULES = `You are "Forge Coach", the assistant inside the Forge diet & training app. Follow these rules for the whole conversation.

SCOPE: Only help with nutrition and diet, meal ideas and planning, body-composition goals (fat loss, muscle gain, maintenance), strength and cardio training, recovery and sleep as they relate to training, and digestive/gut health. If asked about anything else, say briefly that you only cover diet, training and gut health, and offer a related question you can help with.

EVIDENCE: Base advice on mainstream evidence: sports-nutrition consensus (e.g. ISSN position stands), national dietary guidelines, and gastroenterology guidance (e.g. low-FODMAP only as a structured short-term elimination with reintroduction, ideally with a dietitian). Say when evidence is weak. Don't promote fads, detoxes, or "cleanses".

PERSONAL: Use the user's data below. Be concrete: grams, kcal, portions, foods they already eat. Prefer small sustainable changes. Calorie estimates are approximate; the weight trend is the truth.

SAFETY:
- You are not a doctor. Never diagnose. For gut problems give general self-care steps and say when to see a doctor.
- If the user mentions ANY of these, tell them clearly to see a doctor promptly (urgently if severe): blood in stool or black stools, unintended weight loss, persistent vomiting, difficulty swallowing, severe/worsening/constant abdominal pain, fever, symptoms waking them at night, new bowel-habit changes after 50, family history of bowel cancer/IBD/coeliac, signs of anaemia, chest pain, fainting.
- Never suggest intakes below ~1500 kcal (men) / ~1200 kcal (women) without medical supervision, or losing more than ~1% of body weight per week.
- If messages suggest disordered eating (extreme restriction, purging, fear of food, compensating with exercise), respond with warmth, don't give weight-loss tactics, and encourage talking to a doctor or eating-disorder service.
- Supplements: general information only; mention checking with a doctor or pharmacist if they take medication, are pregnant, or have a condition.
- Don't tell the user to cut gluten before a coeliac test.

TRAINING PROGRESSION: The app suggests weights from the user's logged reps and RPE and adjusts for daily readiness; agree with or refine these, using double progression and RPE/reps-in-reserve. On low-readiness days favour holding weight or a lighter session.

MENSTRUAL CYCLE: Research shows cycle-phase effects on strength are small and individual (e.g. McNulty 2020 meta-analysis), so advise based on the user's symptoms and their own data, never fixed 'phase X = lift lighter' rules. Hormonal contraception largely suppresses natural phases. Heavy bleeding, missed periods (especially with low energy intake or high training load — possible low energy availability/RED-S), or severe pain → suggest seeing a doctor.

PLANS: The app builds training programs and meal plans for the user (shown in the data). When asked to change them, suggest concrete swaps that keep the same targets, and remind them they can rebuild the plan in the app (Train → program, Diet → meal plan).

PROTOCOLS: If the data shows the user is on a gut reset protocol, respect it: suggest meals and swaps only from foods allowed in their current phase, follow its one-food-at-a-time rule, and help them interpret reactions. Give honest, brief safety facts when relevant (e.g. raw-food infection risk, high-histamine foods, nutrient gaps in a restrictive phase, when to see a doctor or dietitian), without lecturing or repeating them every message.

STYLE: Reply in the user's language. Be friendly and direct. Keep answers short and skimmable (under ~200 words unless they ask for more), using short paragraphs and "- " bullet lists. Use **bold** sparingly. No tables.`;

/** Compact snapshot of the user's data for the model (kept small on purpose). */
export function buildContext(s: AppState): string {
  const p = s.profile;
  const a = analyze(s, 14);
  const t = dailyTargets(p, false), tt = dailyTargets(p, true);
  const w = weeklySummaries(s, 4);
  const lines: string[] = [];
  lines.push(`Today: ${today()}`);
  lines.push(`Profile: ${p.sex}, ${age(p)} y, ${p.heightCm} cm, ${p.weightKg} kg. Goal: ${p.goal}${p.goal !== 'maintain' ? ` at ${p.rateKgPerWeek} kg/week` : ''}. Activity outside training: ${p.activity}.`);
  lines.push(`Targets: rest day ${t.kcal} kcal (P ${t.protein} / C ${t.carbs} / F ${t.fat} g), training day ${tt.kcal} kcal. Maintenance: formula ${a.formulaMaintenance}${a.measuredMaintenance ? `, measured from data ${a.measuredMaintenance}` : ''}${p.maintenanceKcal ? ' (using measured)' : ''}.`);
  lines.push(`Last 14 days: ${a.loggedDays} fully logged days. Avg intake ${Math.round(a.avgKcal)} kcal, protein ${Math.round(a.avgProtein)} g, carbs ${Math.round(a.avg.carbs ?? 0)} g, fat ${Math.round(a.avg.fat ?? 0)} g, fiber ${Math.round(a.avg.fiber ?? 0)} g, sugar ${Math.round(a.avg.sugar ?? 0)} g, sodium ${Math.round(a.avg.sodium ?? 0)} mg.`);
  lines.push(a.trend ? `Weight trend (28 d): ${a.trend.kgPerWeek.toFixed(2)} kg/week over ${a.trend.points} weigh-ins.` : 'Weight trend: not enough weigh-ins yet.');
  lines.push(`App verdict: ${a.verdict.title} — ${a.verdict.text}`);
  if (a.topFoods.length) lines.push(`Top calorie sources (avg/day): ${a.topFoods.slice(0, 8).map((f) => `${f.name} ${Math.round(f.kcalPerDay)} kcal`).join('; ')}.`);
  const meals = s.entries.filter((e) => e.date === addDays(today(), -1) || e.date === today());
  if (meals.length) lines.push(`Logged yesterday+today: ${meals.map((e) => `${e.date === today() ? 'today' : 'yday'} ${e.meal}: ${e.name} ${Math.round(e.grams)} g`).join('; ').slice(0, 1500)}.`);
  lines.push(`Training last 4 weeks (per week, oldest→newest): ${w.map((x) => `${x.sessions} sessions, load ${Math.round(x.load)}, avg RPE ${x.avgRpe ? x.avgRpe.toFixed(1) : '-'}, ${x.runKm.toFixed(1)} km run`).join(' | ')}.`);
  const lifts = [...new Set(s.sessions.flatMap((x) => x.exercises.map((e) => e.exerciseId)))].slice(0, 8);
  if (lifts.length) lines.push(`Best estimated 1RMs: ${lifts.map((id) => `${exerciseName(s, id)} ${Math.round(Math.max(...exerciseHistory(s, id).map((h) => h.e1rm)))} kg`).join(', ')}.`);
  const gut = (s.gut ?? []).filter((g) => !g.wellnessOnly && g.date > addDays(today(), -14));
  if (gut.length) {
    const g = gutPatterns(s);
    lines.push(`Gut check-ins (14 d): ${gut.length}. Avg symptom score ${(gut.reduce((x, y) => x + symptomScore(y), 0) / gut.length).toFixed(1)} (0–10). Recent: ${gut.slice(-5).map((x) => `${x.date} bloating ${x.bloating}/3 pain ${x.pain}/3 reflux ${x.reflux}/3${x.skin !== undefined ? ` skin ${x.skin}/3` : ''}${x.energy !== undefined ? ` energy ${x.energy}/3` : ''}${x.sleep !== undefined ? ` sleep ${x.sleep}/3` : ''}${x.stool ? ` stool type ${x.stool} (${BRISTOL[x.stool - 1].meaning})` : ''}${x.notes ? ` note "${x.notes.slice(0, 80)}"` : ''}`).join('; ')}.`);
    if (g.patterns.length) lines.push(`Possible triggers (correlation only): ${g.patterns.map((x) => `${x.label} ×${x.ratio.toFixed(1)}`).join(', ')}.`);
  }
  const r = readiness(s);
  lines.push(`Readiness today: ${r.score}/100 (${r.title})${r.reasons.length ? ' — ' + r.reasons.map((x) => `${x.text} ${x.delta > 0 ? '+' : ''}${x.delta}`).join(', ') : ''}${r.checkedIn ? '' : ' (no sleep/energy check-in yet)'}.`);
  const c = cycleInfo(s);
  if (c) lines.push(`Menstrual cycle: day ${c.day} of ~${c.length}${c.hormonal ? ', hormonal contraception' : `, phase ${c.label}`}.`);
  if (lifts.length) lines.push(`Next-session suggestions: ${lifts.slice(0, 6).map((id) => `${exerciseName(s, id)}: ${progression(s, id, undefined, r).text}`).join('; ')}.`);
  if (s.program) lines.push(`Training program: "${s.program.name}" (${s.program.summary}; ${s.program.weekdays.join(', ')}). Days: ${s.program.templateIds.map((id) => s.templates.find((t) => t.id === id)).filter(Boolean).map((t) => `${t!.name}: ${t!.exercises.map((e) => `${exerciseName(s, e.exerciseId)} ${e.sets}x${e.reps}`).join(', ')}`).join(' | ')}.`);
  if (s.mealPlan) lines.push(`Meal plan: ${s.mealPlan.style} diet, ${s.mealPlan.days[0]?.meals.length ?? 0} meals/day. Today's planned meals: ${(s.mealPlan.days.find((d) => d.weekday === ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()])?.meals ?? []).map((m) => `${m.slot}: ${m.items.map((x) => `${x.name} ${x.grams} g`).join(', ')}`).join(' | ')}.`);
  const pc = protocolContext(s);
  if (pc) lines.push(pc);
  return lines.join('\n');
}

export async function askCoach(s: AppState, history: ChatMessage[], onText: (t: string) => void, signal: AbortSignal) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const intro = `${RULES}\n\nUSER DATA (from the app, refreshed every message):\n${buildContext(s)}\n\nThe conversation follows.`;
  const turns = history.slice(-16).map((m) => ({ role: m.role, content: m.content }));
  while (turns.length && turns[0].role === 'assistant') turns.shift();
  const res = await sample([{ role: 'user', content: intro }, ...turns], { cache: false, signal, onText: ({ text }: { text: string }) => onText(text) });
  return res;
}

export function errorText(code?: string) {
  switch (code) {
    case 'not_granted': case 'sampling_disabled': case 'not_declared': case 'capability_disabled': case 'capability_removed':
      return 'The AI coach isn’t enabled for this page. Allow Claude when asked, or open the app on claude.ai.';
    case 'rate_limited': return 'You’ve hit a usage limit — try again in a little while.';
    case 'session_expired': return 'Please sign in to claude.ai again.';
    case 'refused': return 'The coach couldn’t answer that. Try rephrasing.';
    case 'prompt_too_large': return 'The conversation got too long — start a new chat.';
    default: return 'Something went wrong. Try again.';
  }
}
