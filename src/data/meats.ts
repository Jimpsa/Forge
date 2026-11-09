// Meat builder: species × cut × fat % × raw/cooked → nutrients per 100 g.
//
// Model (fitted to USDA FoodData Central ground-beef series 95/5 … 70/30, raw):
//   protein ≈ base − 0.28 × fat%     (beef: 22.8 − 0.28f → 21.4 g @5 %, 20.0 @10 %, 17.2 @20 %, 14.4 @30 %)
//   kcal    = 4.27 × protein + 9.02 × fat (Atwater specific factors for meat; meat has ~no carbohydrate)
// Minerals/B12 scale with the lean fraction. Cooking: water is lost (yield), some fat renders out.
// "Cooked" means grilled/pan-fried WITHOUT added fat — log oil or butter separately.
import type { Food, Nutrients } from '../types';

export type Species = 'beef' | 'pork' | 'mixed' | 'chicken' | 'turkey' | 'lamb' | 'veal' | 'game';

interface SpeciesInfo {
  label: string;
  base: number; // protein g/100 g at 0 % fat (raw)
  satShare: number; // saturated fat as share of total fat
  lean: Nutrients; // micronutrients per 100 g of raw lean (~5 % fat)
  keywords: string;
}

export const SPECIES: Record<Species, SpeciesInfo> = {
  beef: { label: 'Beef', base: 22.8, satShare: 0.42, keywords: 'nöt nötkött oxkött', lean: { sodium: 60, potassium: 330, calcium: 6, iron: 2.6, magnesium: 21, zinc: 5.5, vitB12: 2.5, vitD: 0.1, cholesterol: 62 } },
  pork: { label: 'Pork', base: 22.0, satShare: 0.36, keywords: 'fläsk gris', lean: { sodium: 55, potassium: 360, calcium: 6, iron: 0.9, magnesium: 23, zinc: 2.2, vitB12: 0.6, vitD: 0.6, cholesterol: 62 } },
  mixed: { label: 'Mixed beef & pork', base: 22.4, satShare: 0.39, keywords: 'blandfärs blandad', lean: { sodium: 58, potassium: 345, calcium: 6, iron: 1.8, magnesium: 22, zinc: 3.9, vitB12: 1.6, vitD: 0.35, cholesterol: 62 } },
  chicken: { label: 'Chicken', base: 23.0, satShare: 0.28, keywords: 'kyckling', lean: { sodium: 60, potassium: 300, calcium: 8, iron: 0.7, magnesium: 27, zinc: 1.3, vitB12: 0.4, vitD: 0.1, cholesterol: 75 } },
  turkey: { label: 'Turkey', base: 23.0, satShare: 0.30, keywords: 'kalkon', lean: { sodium: 60, potassium: 290, calcium: 10, iron: 0.9, magnesium: 28, zinc: 2.0, vitB12: 1.2, vitD: 0.2, cholesterol: 65 } },
  lamb: { label: 'Lamb', base: 21.5, satShare: 0.45, keywords: 'lamm', lean: { sodium: 65, potassium: 300, calcium: 10, iron: 1.9, magnesium: 24, zinc: 4.3, vitB12: 2.5, vitD: 0.1, cholesterol: 66 } },
  veal: { label: 'Veal', base: 22.0, satShare: 0.40, keywords: 'kalv kalvkött', lean: { sodium: 80, potassium: 330, calcium: 10, iron: 1.0, magnesium: 25, zinc: 3.5, vitB12: 1.5, vitD: 0.1, cholesterol: 80 } },
  game: { label: 'Game (moose, deer, reindeer)', base: 22.8, satShare: 0.40, keywords: 'vilt älg hjort rådjur ren renkött venison moose elk reindeer', lean: { sodium: 50, potassium: 320, calcium: 6, iron: 3.4, magnesium: 25, zinc: 3.0, vitB12: 3.0, vitD: 0.2, cholesterol: 80 } },
};

export interface Cut { key: string; name: string; fat: number; min: number; max: number; mince?: boolean; keywords?: string }

const C = (key: string, name: string, fat: number, min = Math.max(1, fat - 6), max = fat + 10, extra: Partial<Cut> = {}): Cut => ({ key, name, fat, min, max, ...extra });

export const CUTS: Record<Species, Cut[]> = {
  beef: [
    C('mince', 'Minced beef', 10, 2, 30, { mince: true, keywords: 'nötfärs färs ground beef mince' }),
    C('ribeye', 'Ribeye / entrecôte', 18, 8, 30, { keywords: 'entrecote entrecôte ribeye rib eye' }),
    C('sirloin', 'Sirloin / rump steak', 8, 3, 18, { keywords: 'ryggbiff rumpstek sirloin rump' }),
    C('fillet', 'Fillet / tenderloin', 6, 2, 14, { keywords: 'oxfilé filé tenderloin fillet mignon' }),
    C('striploin', 'Striploin / New York strip', 12, 5, 22, { keywords: 'ryggbiff striploin new york strip' }),
    C('tbone', 'T-bone / porterhouse', 16, 8, 26, { keywords: 't-bone porterhouse' }),
    C('flank', 'Flank steak', 6, 3, 14, { keywords: 'flankstek flank' }),
    C('skirt', 'Skirt / hanger steak', 12, 6, 20, { keywords: 'skirt hanger onglet' }),
    C('picanha', 'Picanha (rump cap)', 14, 6, 26, { keywords: 'picanha rostbiffslock' }),
    C('topside', 'Topside / roast beef', 4, 2, 10, { keywords: 'rostbiff innanlår fransyska topside roast' }),
    C('chuck', 'Chuck / stewing beef', 15, 6, 26, { keywords: 'högrev grytbitar chuck stew' }),
    C('brisket', 'Brisket', 20, 10, 32, { keywords: 'bringa brisket' }),
    C('shortrib', 'Short ribs', 28, 18, 40, { keywords: 'short ribs högrevsrevben' }),
    C('liver', 'Liver', 4, 3, 6, { keywords: 'lever liver' }),
  ],
  pork: [
    C('mince', 'Minced pork', 15, 5, 30, { mince: true, keywords: 'fläskfärs färs ground pork' }),
    C('tenderloin', 'Pork tenderloin', 3, 1, 8, { keywords: 'fläskfilé filé tenderloin' }),
    C('loin', 'Pork loin / chop', 9, 3, 20, { keywords: 'fläskkotlett kotlett karré chop loin' }),
    C('neck', 'Pork neck / collar', 18, 10, 26, { keywords: 'fläskkarré karré nacke collar' }),
    C('shoulder', 'Pork shoulder', 15, 8, 25, { keywords: 'bog fläskbog pulled pork shoulder' }),
    C('belly', 'Pork belly', 50, 30, 60, { keywords: 'sidfläsk fläsksida belly' }),
    C('ribs', 'Spare ribs', 23, 15, 30, { keywords: 'revben spareribs ribs' }),
    C('ham', 'Ham steak / leg', 5, 2, 12, { keywords: 'skinka ham' }),
  ],
  mixed: [C('mince', 'Mixed mince (beef & pork)', 15, 5, 25, { mince: true, keywords: 'blandfärs färs' })],
  chicken: [
    C('breast', 'Chicken breast, skinless', 2, 1, 6, { keywords: 'kycklingfilé kycklingbröst filé breast' }),
    C('breastskin', 'Chicken breast, with skin', 9, 6, 12),
    C('thigh', 'Chicken thigh, skinless', 5, 3, 10, { keywords: 'kycklinglårfilé lårfilé thigh' }),
    C('thighskin', 'Chicken thigh, with skin', 15, 10, 20, { keywords: 'kycklinglår lår' }),
    C('drumstick', 'Drumstick, with skin', 9, 4, 14, { keywords: 'kycklingklubba klubba drumstick' }),
    C('wing', 'Wing, with skin', 15, 10, 20, { keywords: 'kycklingvingar vingar wings' }),
    C('whole', 'Whole chicken (meat + skin)', 12, 6, 18, { keywords: 'hel kyckling grillad rotisserie' }),
    C('mince', 'Minced chicken', 8, 2, 15, { mince: true, keywords: 'kycklingfärs färs ground chicken' }),
  ],
  turkey: [
    C('breast', 'Turkey breast', 1, 1, 4, { keywords: 'kalkonbröst kalkonfilé breast' }),
    C('thigh', 'Turkey thigh', 6, 3, 10),
    C('mince', 'Minced turkey', 8, 2, 15, { mince: true, keywords: 'kalkonfärs färs ground turkey' }),
  ],
  lamb: [
    C('mince', 'Minced lamb', 20, 8, 30, { mince: true, keywords: 'lammfärs färs ground lamb' }),
    C('chop', 'Lamb chops', 20, 10, 30, { keywords: 'lammkotlett lammracks racks chops' }),
    C('leg', 'Leg of lamb', 10, 4, 18, { keywords: 'lammstek lammfiol leg' }),
    C('shoulder', 'Lamb shoulder', 17, 10, 26, { keywords: 'lammbog bog shoulder' }),
  ],
  veal: [
    C('cutlet', 'Veal cutlet / escalope', 3, 1, 8, { keywords: 'kalvschnitzel schnitzel escalope' }),
    C('mince', 'Minced veal', 10, 4, 20, { mince: true, keywords: 'kalvfärs färs' }),
  ],
  game: [
    C('steak', 'Moose / deer steak', 2, 1, 6, { keywords: 'älgstek hjortstek älg hjort steak' }),
    C('mince', 'Game mince', 5, 2, 15, { mince: true, keywords: 'viltfärs älgfärs färs' }),
    C('reindeer', 'Reindeer (sliced / steak)', 4, 2, 10, { keywords: 'renskav ren renkött reindeer' }),
  ],
};

// Liver is nutritionally very different — use a reference profile instead of the lean-meat model.
const LIVER_RAW: Nutrients = { kcal: 135, protein: 20.4, carbs: 3.9, fat: 3.6, fiber: 0, sugar: 0, satFat: 1.2, cholesterol: 275, sodium: 69, potassium: 313, calcium: 5, iron: 4.9, magnesium: 18, zinc: 4, vitA: 4968, vitC: 1.3, vitD: 1.2, vitB12: 59 };

export function meatNutrients(species: Species, cut: Cut, fatPct: number, cooked: boolean): Nutrients {
  const sp = SPECIES[species];
  let n: Nutrients;
  if (cut.key === 'liver') n = { ...LIVER_RAW };
  else {
    const protein = Math.max(8, sp.base - 0.28 * fatPct);
    const leanFactor = (100 - fatPct) / 95;
    n = { kcal: 4.27 * protein + 9.02 * fatPct, protein, carbs: 0, fat: fatPct, fiber: 0, sugar: 0, satFat: fatPct * sp.satShare };
    for (const [k, v] of Object.entries(sp.lean)) (n as Record<string, number>)[k] = (k === 'cholesterol' ? v : v * leanFactor);
  }
  if (!cooked) return n;
  // Cooking losses: water evaporates (yield) and part of the fat renders out (more for mince, which is drained).
  const yieldF = cut.mince ? 0.68 : species === 'chicken' || species === 'turkey' ? 0.75 : 0.74;
  const fatKeep = cut.mince ? 0.62 : 0.9;
  const out: Nutrients = {};
  for (const [k, v] of Object.entries(n)) (out as Record<string, number>)[k] = (v as number) / yieldF;
  out.fat = (n.fat! * fatKeep) / yieldF;
  out.satFat = (n.satFat! * fatKeep) / yieldF;
  out.kcal = 4.27 * out.protein! + 4 * out.carbs! + 9.02 * out.fat;
  return out;
}

export function buildMeatFood(species: Species, cut: Cut, fatPct: number, cooked: boolean): Food {
  const per100 = meatNutrients(species, cut, fatPct, cooked);
  const showFat = cut.key !== 'liver';
  const name = `${cut.name}${showFat ? ` ${fatPct}% fat` : ''}, ${cooked ? 'cooked' : 'raw'}`;
  const portion = cut.mince ? 125 : /wing/.test(cut.key) ? 30 : /drumstick/.test(cut.key) ? 75 : 150;
  return {
    id: `m-${species}-${cut.key}-${fatPct}-${cooked ? 'c' : 'r'}`,
    name,
    per100,
    servings: [{ label: cut.mince ? '1 portion' : /wing|drumstick/.test(cut.key) ? '1 piece' : '1 portion', grams: cooked ? Math.round(portion * 0.75) : portion }],
    source: 'custom',
    keywords: `${SPECIES[species].label} ${SPECIES[species].keywords} ${cut.keywords ?? ''} meat kött`,
  };
}

/** Does a search query look like the user wants meat? Used to suggest the builder. */
export const looksLikeMeat = (q: string) =>
  /(beef|steak|mince|ground|pork|chicken|turkey|lamb|veal|moose|deer|venison|reindeer|rib|fillet|sirloin|brisket|chuck|loin|belly|thigh|breast|wing|drumstick|färs|nöt|kött|fläsk|kyckling|kalkon|lamm|kalv|älg|ren|entrec|oxfil|biff|stek)/i.test(q);
