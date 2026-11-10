// Gut-health tracking: daily symptom check-ins, food/symptom patterns, and an evidence-based guide.
import type { AppState, GutLog } from '../types';
import { entriesFor, sum, dailyTargets, isTrainingDay } from './nutrition';
import { addDays, today } from './util';

export const SEVERITY = ['None', 'Mild', 'Moderate', 'Severe'];

export const BRISTOL: { type: number; label: string; meaning: string }[] = [
  { type: 1, label: 'Separate hard lumps', meaning: 'constipated' },
  { type: 2, label: 'Lumpy, sausage-shaped', meaning: 'constipated' },
  { type: 3, label: 'Sausage with cracks', meaning: 'normal' },
  { type: 4, label: 'Smooth, soft sausage', meaning: 'ideal' },
  { type: 5, label: 'Soft blobs, clear edges', meaning: 'lacking fiber' },
  { type: 6, label: 'Fluffy, mushy pieces', meaning: 'loose' },
  { type: 7, label: 'Watery, no solid pieces', meaning: 'diarrhea' },
];

export const symptomScore = (g: GutLog) => g.bloating + g.pain + g.reflux + (g.stool && (g.stool <= 2 || g.stool >= 6) ? 1 : 0);
/** Gut symptoms + skin (eczema), used for food-pattern detection. */
export const totalScore = (g: GutLog) => symptomScore(g) + (g.skin ?? 0) + Math.min(3, (g.hist ?? []).length);

// Common trigger groups, matched on logged food names (English + some Swedish words).
const TRIGGERS: { key: string; label: string; re: RegExp; why: string }[] = [
  { key: 'dairy', label: 'Dairy (lactose)', re: /(milk|mjölk|yogh?urt|yoghurt|cheese|\bost\b|cream|grädde|ice cream|glass|quark|kvarg|cottage|skyr|whey|latte|cappuccino)/i, why: 'Lactose intolerance is common; skyr, hard cheese and lactose-free milk are usually tolerated better.' },
  { key: 'wheat', label: 'Wheat / gluten grains', re: /(bread|bröd|pasta|wheat|vete|granola|cereal|flingor|bagel|wrap|tortilla|pizza|couscous|crackers|knäck|rye|råg|bulle|cake|kaka|biscuit)/i, why: 'Wheat is high in fructans (a FODMAP) — often the trigger rather than gluten itself. Persistent issues: get tested for coeliac disease BEFORE cutting gluten.' },
  { key: 'legumes', label: 'Beans & lentils', re: /(bean|böna|bönor|lentil|lins|chickpea|kikärt|hummus|soy|soja|pea\b|ärt)/i, why: 'Legumes contain GOS fibres that ferment and cause gas. Canned and rinsed, smaller portions and a gradual increase help.' },
  { key: 'onion', label: 'Onion & garlic', re: /(onion|lök|garlic|vitlök|shallot)/i, why: 'Very high in fructans; a classic IBS trigger. Garlic-infused oil gives flavour without the FODMAPs.' },
  { key: 'coffee', label: 'Coffee', re: /(coffee|kaffe|espresso|latte|cappuccino)/i, why: 'Coffee stimulates the gut and can trigger reflux or loose stools.' },
  { key: 'alcohol', label: 'Alcohol', re: /(beer|öl|wine|vin|cider|vodka|whisk|gin|rum|lager|ale|ipa|prosecco|cocktail)/i, why: 'Alcohol irritates the gut lining and worsens reflux and loose stools.' },
  { key: 'sweeteners', label: 'Sugar alcohols & sweeteners', re: /(sugar.?free|sockerfri|sorbitol|xylitol|maltitol|erythritol|protein bar|gum|tuggummi|light)/i, why: 'Sugar alcohols (common in protein bars, gum, "sugar-free" products) are FODMAPs and laxative in larger amounts.' },
  { key: 'fruit', label: 'High-fructose fruit & juice', re: /(apple|äpple|pear|päron|mango|watermelon|juice|honey|honung|dried fruit|russin|raisin)/i, why: 'Excess fructose ferments. Berries, citrus, kiwi and banana are lower-FODMAP choices.' },
  { key: 'spicy', label: 'Spicy food', re: /(chili|chilli|jalapeño|sriracha|curry|tabasco|hot sauce|spicy|stark)/i, why: 'Capsaicin can trigger reflux and urgency.' },
];

export interface Pattern { key: string; label: string; why: string; withAvg: number; withoutAvg: number; nWith: number; nWithout: number; ratio: number }

/** Compares symptom scores on days when a trigger was eaten (same day or the day before) vs days without. */
export function gutPatterns(s: AppState): { patterns: Pattern[]; checkins: number; extra: string[] } {
  const logs = (s.gut ?? []).filter((g) => !g.wellnessOnly && g.date > addDays(today(), -60));
  const extra: string[] = [];
  if (logs.length < 7) return { patterns: [], checkins: logs.length, extra };
  const ate = (date: string, re: RegExp) => entriesFor(s, date).some((e) => re.test(e.name));
  const patterns: Pattern[] = [];
  for (const t of TRIGGERS) {
    // Symptoms can follow within hours (same day) or the next day — test both, keep the stronger signal.
    let best: Pattern | undefined;
    for (const lag of [0, 1]) {
      const w = logs.filter((g) => ate(addDays(g.date, -lag), t.re)), wo = logs.filter((g) => !ate(addDays(g.date, -lag), t.re));
      if (w.length < 3 || wo.length < 3) continue;
      const withAvg = w.reduce((a, g) => a + totalScore(g), 0) / w.length;
      const withoutAvg = wo.reduce((a, g) => a + totalScore(g), 0) / wo.length;
      const ratio = (withAvg + 0.25) / (withoutAvg + 0.25);
      if (withAvg - withoutAvg >= 0.75 && ratio >= 1.4 && (!best || ratio > best.ratio))
        best = { key: t.key, label: t.label + (lag ? ' (day before)' : ''), why: t.why, withAvg, withoutAvg, nWith: w.length, nWithout: wo.length, ratio };
    }
    if (best) patterns.push(best);
  }
  patterns.sort((a, b) => b.ratio - a.ratio);

  // Lifestyle signals.
  const stools = logs.filter((g) => g.stool).map((g) => g.stool!);
  const hard = stools.filter((x) => x <= 2).length, loose = stools.filter((x) => x >= 6).length;
  const recent = Array.from({ length: 14 }, (_, i) => addDays(today(), -14 + i));
  const fiber = recent.map((d) => sum(entriesFor(s, d).map((e) => e.nutrients))).filter((n) => (n.kcal ?? 0) > 800).map((n) => n.fiber ?? 0);
  const avgFiber = fiber.length ? fiber.reduce((a, b) => a + b, 0) / fiber.length : undefined;
  const water = recent.map((d) => s.water[d] ?? 0).filter((x) => x > 0);
  const avgWater = water.length ? water.reduce((a, b) => a + b, 0) / water.length : undefined;
  if (stools.length >= 5 && hard / stools.length >= 0.4)
    extra.push(`Hard stools on ${Math.round((hard / stools.length) * 100)}% of check-ins (constipation).${avgFiber !== undefined ? ` Your fiber averages ${Math.round(avgFiber)} g/day (aim 25–35 g).` : ''}${avgWater !== undefined ? ` Water averages ${(avgWater / 1000).toFixed(1)} L.` : ''} See “Constipation” below.`);
  if (stools.length >= 5 && loose / stools.length >= 0.4) extra.push(`Loose stools on ${Math.round((loose / stools.length) * 100)}% of check-ins. See “Loose stools” below — and see a doctor if it has lasted more than 2–3 weeks.`);
  const highFatDays = logs.filter((g) => { const n = sum(entriesFor(s, g.date).map((e) => e.nutrients)); return (n.fat ?? 0) > dailyTargets(s.profile, isTrainingDay(s, g.date)).fat * 1.3; });
  if (highFatDays.length >= 3) {
    const hi = highFatDays.reduce((a, g) => a + totalScore(g), 0) / highFatDays.length;
    const rest = logs.filter((g) => !highFatDays.includes(g));
    const lo = rest.length ? rest.reduce((a, g) => a + totalScore(g), 0) / rest.length : hi;
    if (hi - lo >= 0.75) extra.push('Symptoms are worse on high-fat days. Large fatty meals slow digestion and relax the valve above the stomach (reflux) — try smaller, leaner meals.');
  }
  return { patterns, checkins: logs.length, extra };
}

export const RED_FLAGS = [
  'Blood in your stool, or black/tarry stools',
  'Unintended weight loss',
  'Persistent vomiting, or vomiting blood',
  'Difficulty or pain when swallowing',
  'Severe, worsening or constant abdominal pain',
  'Fever with gut symptoms',
  'Symptoms that wake you at night',
  'A lasting change in bowel habits after age 50',
  'Family history of bowel cancer, IBD (Crohn’s/colitis) or coeliac disease',
  'Signs of anaemia: unusual tiredness, paleness, breathlessness',
];

export const GUIDE: { title: string; points: string[] }[] = [
  { title: 'Everyday gut-friendly habits', points: [
    'Aim for 25–35 g fiber a day from varied sources. Raise it gradually over 2–3 weeks so your gut can adapt.',
    'Variety matters: ~30 different plant foods a week (fruit, veg, legumes, whole grains, nuts, seeds, herbs) is linked to a more diverse microbiome.',
    'Fermented foods (yogurt, kefir, skyr, sauerkraut, kimchi) can add beneficial bacteria.',
    'Drink enough water — fiber needs fluid to work. Pale-yellow urine is a good sign.',
    'Eat slowly and chew well; regular meal times help a sensitive gut.',
    'Move daily: walking after meals helps digestion and gas. Sleep and stress strongly affect the gut via the gut–brain axis.',
  ] },
  { title: 'Bloating & gas', points: [
    'Common causes: eating fast, fizzy drinks, chewing gum, big portions of beans, onion/garlic, wheat, or sugar alcohols.',
    'Check whether a bigger fiber increase came on suddenly — slow down and add water.',
    'Use the check-in daily: after 1–2 weeks the Patterns section shows which foods line up with bad days.',
    'Peppermint oil capsules have decent evidence for IBS-type bloating and pain (check with a pharmacist if you take medication).',
  ] },
  { title: 'Constipation (stool type 1–2)', points: [
    'Increase fiber gradually — oats, kiwi (2 a day has good evidence), prunes, linseed/psyllium, beans and veg.',
    'Drink more water, especially when increasing fiber.',
    'Move every day; even a 20–30 min walk stimulates the bowel.',
    'Don’t ignore the urge, and give yourself unhurried time after breakfast. A footstool (knees above hips) helps.',
  ] },
  { title: 'Loose stools (type 6–7)', points: [
    'Common triggers: coffee, alcohol, sugar alcohols, very fatty meals, high lactose, spicy food — and stress.',
    'Short-term: drink plenty, use an oral rehydration solution if it is frequent, and eat simple foods (rice, banana, toast, oats).',
    'Soluble fiber (oats, psyllium) can firm stools.',
    'More than 2–3 weeks, blood, fever or weight loss → see a doctor.',
  ] },
  { title: 'Reflux & heartburn', points: [
    'Smaller meals; avoid lying down for 2–3 hours after eating.',
    'Common triggers: large fatty meals, alcohol, coffee, chocolate, spicy food, citrus/tomato, carbonated drinks.',
    'Raise the head of the bed and avoid tight waistbands. Losing excess weight helps a lot.',
    'Heavy lifting and bracing right after a meal can provoke it — leave 2 hours before training.',
    'Needing antacids most weeks, or trouble swallowing → see a doctor.',
  ] },
  { title: 'IBS and the low-FODMAP approach', points: [
    'IBS means recurring pain with altered bowel habits, without another cause — it is diagnosed by a doctor after ruling out e.g. coeliac disease.',
    'Low-FODMAP is a 3-step plan, not a forever diet: (1) cut high-FODMAP foods for 2–6 weeks, (2) reintroduce one group at a time to find your triggers, (3) keep only the restrictions you need.',
    'It works best with a dietitian — long-term restriction can harm your microbiome.',
    'Don’t cut out gluten before a coeliac test: the test needs gluten in your diet to be accurate.',
  ] },
  { title: 'Training & your gut', points: [
    'Hard runs can cause urgency or cramps: avoid high-fiber, high-fat meals 2–3 hours before and train your gut with small carb snacks.',
    'Pre-workout supplements, caffeine and sugar alcohols are common causes of gut trouble during training.',
    'Very high protein from shakes and bars can cause gas — favour whole-food protein when possible.',
  ] },
];
