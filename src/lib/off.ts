// Open Food Facts — free, open product database (3M+ products, barcodes). https://world.openfoodfacts.org
import type { Food, Nutrients, Serving } from '../types';

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity';

/* eslint-disable @typescript-eslint/no-explicit-any */
function toFood(p: any): Food | null {
  const n = p?.nutriments;
  const name = p?.product_name?.trim();
  if (!n || !name) return null;
  const g = (k: string) => (typeof n[k] === 'number' ? n[k] : n[k] !== undefined && !isNaN(+n[k]) ? +n[k] : undefined);
  const mg = (k: string) => { const v = g(k); return v === undefined ? undefined : v * 1000; };
  const ug = (k: string) => { const v = g(k); return v === undefined ? undefined : v * 1e6; };
  let kcal = g('energy-kcal_100g');
  if (kcal === undefined && g('energy_100g') !== undefined) kcal = g('energy_100g')! / 4.184;
  if (kcal === undefined) return null;
  const per100: Nutrients = {
    kcal, protein: g('proteins_100g'), carbs: g('carbohydrates_100g'), fat: g('fat_100g'), fiber: g('fiber_100g'),
    sugar: g('sugars_100g'), satFat: g('saturated-fat_100g'), cholesterol: mg('cholesterol_100g'),
    sodium: mg('sodium_100g') ?? (g('salt_100g') !== undefined ? g('salt_100g')! * 400 : undefined),
    potassium: mg('potassium_100g'), calcium: mg('calcium_100g'), iron: mg('iron_100g'), magnesium: mg('magnesium_100g'),
    zinc: mg('zinc_100g'), vitA: ug('vitamin-a_100g'), vitC: mg('vitamin-c_100g'), vitD: ug('vitamin-d_100g'), vitB12: ug('vitamin-b12_100g'),
  };
  for (const k of Object.keys(per100) as (keyof Nutrients)[]) if (per100[k] === undefined) delete per100[k];
  const servings: Serving[] = [];
  const sq = Number(p.serving_quantity);
  if (sq > 0) servings.push({ label: p.serving_size || `1 serving`, grams: sq });
  return { id: 'off-' + p.code, name, brand: p.brands?.split(',')[0]?.trim(), per100, servings, source: 'off', barcode: p.code };
}

export async function searchOff(query: string, signal?: AbortSignal): Promise<Food[]> {
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=25&fields=${FIELDS}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return (data.products ?? []).map(toFood).filter(Boolean) as Food[];
}

export async function lookupBarcode(code: string): Promise<Food | null> {
  const res = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.status === 1 ? toFood(data.product) : null;
}
