import { useEffect, useMemo, useRef, useState } from 'react';
import type { Food, Meal, NutrientKey, Nutrients } from '../types';
import { NUTRIENTS, MEALS } from '../types';
import { getState, mutate, useAppState } from '../lib/storage';
import { allFoods, findFood, recipePer100, scale } from '../lib/nutrition';
import { lookupBarcode, searchOff } from '../lib/off';
import { fmt, uid } from '../lib/util';
import { NumField, Seg, Sheet } from './ui';
import { IS_ARTIFACT } from '../lib/env';
import { haptic, sound } from '../lib/fx';
import { CUTS, SPECIES, buildMeatFood, looksLikeMeat, type Species } from '../data/meats';

type Tab = 'search' | 'meat' | 'scan' | 'create' | 'recipe';

export function FoodPicker({ open, onClose, date, meal: initialMeal }: { open: boolean; onClose: () => void; date: string; meal: Meal }) {
  const [tab, setTab] = useState<Tab>('search');
  const [picked, setPicked] = useState<Food | null>(null);
  const [meal, setMeal] = useState<Meal>(initialMeal);
  useEffect(() => { if (open) { setMeal(initialMeal); setPicked(null); setTab('search'); } }, [open, initialMeal]);

  const choose = (f: Food) => {
    // Persist foods that came from the online DB so they work offline and show up in "recent".
    if ((f.source === 'off' || f.id.startsWith('m-')) && !getState().foods.some((x) => x.id === f.id)) mutate((s) => { s.foods.unshift(f); });
    setPicked(f);
  };

  return (
    <Sheet open={open} onClose={onClose} title={picked ? 'Amount' : 'Add food'}>
      {picked ? (
        <AmountStep food={picked} meal={meal} setMeal={setMeal} onBack={() => setPicked(null)}
          onAdd={(grams) => {
            mutate((s) => { s.entries.push({ id: uid(), date, meal, foodId: picked.id, name: picked.name, grams, nutrients: scale(picked.per100, grams) }); });
            haptic('tick'); sound('tick');
            onClose();
          }} />
      ) : (
        <>
          <Seg value={tab} onChange={setTab} options={[{ value: 'search' as Tab, label: 'Search' }, { value: 'meat' as Tab, label: 'Meat' }, ...(IS_ARTIFACT ? [] : [{ value: 'scan' as Tab, label: 'Scan' }]), { value: 'create', label: 'New' }, { value: 'recipe', label: 'Recipe' }]} />
          <div style={{ marginTop: 14 }}>
            {tab === 'search' && <SearchTab onPick={choose} onMeat={() => setTab('meat')} />}
            {tab === 'meat' && <MeatTab onPick={choose} />}
            {tab === 'scan' && <ScanTab onPick={choose} />}
            {tab === 'create' && <CreateFood onCreated={choose} />}
            {tab === 'recipe' && <RecipeBuilder onCreated={choose} />}
          </div>
        </>
      )}
    </Sheet>
  );
}

function FoodRow({ f, onPick }: { f: Food; onPick: (f: Food) => void }) {
  const p = f.per100;
  return (
    <div className="list-item click" onClick={() => onPick(f)}>
      <div className="grow">
        <div>{f.name} {f.source === 'recipe' && <span className="pill accent">recipe</span>}{f.favorite && ' ★'}</div>
        <div className="tiny muted">{f.brand ? f.brand + ' · ' : ''}{fmt(p.kcal)} kcal · P {fmt(p.protein, 1)} · C {fmt(p.carbs, 1)} · F {fmt(p.fat, 1)} per 100 g</div>
      </div>
      <span className="muted">›</span>
    </div>
  );
}

function SearchTab({ onPick, onMeat }: { onPick: (f: Food) => void; onMeat: () => void }) {
  const s = useAppState();
  const [q, setQ] = useState('');
  const [online, setOnline] = useState<Food[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const local = useMemo(() => {
    const all = allFoods(s);
    if (!q.trim()) {
      const recentIds = [...new Set([...s.entries].reverse().map((e) => e.foodId))].slice(0, 12);
      const recent = recentIds.map((id) => all.find((f) => f.id === id)).filter(Boolean) as Food[];
      const favs = all.filter((f) => f.favorite && !recentIds.includes(f.id));
      return [...favs, ...recent];
    }
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((f) => terms.every((t) => `${f.name} ${f.brand ?? ''} ${f.keywords ?? ''}`.toLowerCase().includes(t))).slice(0, 40);
  }, [s, q]);

  const ctrl = useRef<AbortController | null>(null);
  const goOnline = async () => {
    if (!q.trim()) return;
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setStatus('loading');
    try { setOnline(await searchOff(q, ctrl.current.signal)); setStatus('idle'); }
    catch (e) { if ((e as Error).name !== 'AbortError') setStatus('error'); }
  };
  useEffect(() => { setOnline([]); }, [q]);

  return (
    <div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); goOnline(); }}>
        <input autoFocus placeholder="Search foods, e.g. 'oats' or a brand" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <div style={{ marginTop: 8 }}>
        {!q.trim() && <div className="tiny muted" style={{ margin: '6px 0' }}>{local.length ? 'Favorites & recent' : 'Type to search the built-in database and your foods.'}</div>}
        {local.map((f) => <FoodRow key={f.id} f={f} onPick={onPick} />)}
        {q.trim() && looksLikeMeat(q) && (
          <div className="list-item click" onClick={onMeat} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px', marginTop: 6 }}>
            <div className="grow"><div>🥩 Build the exact cut & fat %</div><div className="tiny muted">Choose cut, set fat % (e.g. mince 5–20%) and raw or cooked weight</div></div>
            <span className="muted">›</span>
          </div>
        )}
        {q.trim() && !IS_ARTIFACT && (
          <div style={{ marginTop: 10 }}>
            <button className="btn block" onClick={goOnline} disabled={status === 'loading'}>
              {status === 'loading' ? 'Searching Open Food Facts…' : `Search online for “${q}”`}
            </button>
            {status === 'error' && <p className="small" style={{ color: 'var(--danger)' }}>Couldn’t reach Open Food Facts. Check your connection.</p>}
            {online.map((f) => <FoodRow key={f.id} f={f} onPick={onPick} />)}
          </div>
        )}
      </div>
    </div>
  );
}

declare global { interface Window { BarcodeDetector?: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

function MeatTab({ onPick }: { onPick: (f: Food) => void }) {
  const [species, setSpecies] = useState<Species>('beef');
  const [cutKey, setCutKey] = useState(CUTS.beef[0].key);
  const cut = CUTS[species].find((c) => c.key === cutKey) ?? CUTS[species][0];
  const [fat, setFat] = useState(cut.fat);
  const [cooked, setCooked] = useState<'raw' | 'cooked'>('raw');
  const pickSpecies = (sp: Species) => { setSpecies(sp); setCutKey(CUTS[sp][0].key); setFat(CUTS[sp][0].fat); };
  const pickCut = (key: string) => { setCutKey(key); setFat(CUTS[species].find((c) => c.key === key)!.fat); };
  const food = buildMeatFood(species, cut, fat, cooked === 'cooked');
  const isLiver = cut.key === 'liver';
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 6 }}>
        {(Object.keys(SPECIES) as Species[]).map((sp) => (
          <button key={sp} className={'btn sm' + (sp === species ? ' primary' : '')} onClick={() => pickSpecies(sp)}>{SPECIES[sp].label.replace(' (moose, deer, reindeer)', '')}</button>
        ))}
      </div>
      <label className="field"><span>Cut</span>
        <select value={cut.key} onChange={(e) => pickCut(e.target.value)}>{CUTS[species].map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
      </label>
      {!isLiver && (
        <div>
          <div className="row between small"><span>Fat content{cut.mince ? ' (as on the pack)' : ''}</span><strong className="num">{fat}%</strong></div>
          <input type="range" min={cut.min} max={cut.max} step={1} value={fat} onChange={(e) => setFat(+e.target.value)} style={{ padding: 0 }} aria-label="Fat percent" />
          <div className="row between tiny muted"><span>{cut.min}% lean</span><span>typical {cut.fat}%</span><span>{cut.max}%</span></div>
        </div>
      )}
      <div>
        <div className="small" style={{ marginBottom: 4 }}>I’m weighing it…</div>
        <Seg value={cooked} onChange={setCooked} options={[{ value: 'raw', label: 'Raw' }, { value: 'cooked', label: 'Cooked' }]} />
        <p className="tiny muted" style={{ marginTop: 4 }}>{cooked === 'raw' ? 'Most accurate: weigh before cooking.' : `Cooked weight (fried/grilled without added fat${cut.mince ? ', fat drained' : ''}). Log oil or butter separately.`}</p>
      </div>
      <div className="small muted">Per 100 g:</div>
      <NutrientTable n={food.per100} />
      <button className="btn primary block" onClick={() => onPick(food)}>Continue with {food.name.toLowerCase()}</button>
      <p className="tiny muted">Estimated from reference values (USDA): protein falls ~0.28 g for every 1% more fat. Pack labels beat estimates — for a specific product, scan it or add it under “New”.</p>
    </div>
  );
}

function ScanTab({ onPick }: { onPick: (f: Food) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const supported = typeof window !== 'undefined' && !!window.BarcodeDetector;

  const lookup = async (c: string) => {
    const local = allFoods(getState()).find((f) => f.barcode === c);
    if (local) return onPick(local);
    setMsg(`Looking up ${c}…`);
    try {
      const f = await lookupBarcode(c);
      if (f) onPick(f); else setMsg(`No product found for ${c}. You can add it under “New food”.`);
    } catch { setMsg('Lookup failed — check your connection.'); }
  };

  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | undefined, raf = 0, stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const tick = async () => {
          if (stop || !video.current) return;
          try { const r = await det.detect(video.current); if (r[0]) { stop = true; lookup(r[0].rawValue); return; } } catch { /* frame not ready */ }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setMsg('Camera unavailable. Enter the barcode number instead.'); }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [supported]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack">
      {supported ? <video ref={video} className="scanner" muted playsInline /> : <p className="small muted">Camera scanning isn’t supported in this browser (works in Chrome on Android). Type the barcode instead:</p>}
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (code.trim()) lookup(code.trim()); }}>
        <input inputMode="numeric" placeholder="Barcode number" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn primary">Look up</button>
      </form>
      {msg && <p className="small muted">{msg}</p>}
    </div>
  );
}

function AmountStep({ food, meal, setMeal, onAdd, onBack }: { food: Food; meal: Meal; setMeal: (m: Meal) => void; onAdd: (g: number) => void; onBack: () => void }) {
  const state = useAppState();
  const servings = [...food.servings, { label: 'grams', grams: 1 }];
  const [si, setSi] = useState(0);
  const [qty, setQty] = useState<number | undefined>(servings[0].grams === 1 ? 100 : 1);
  const grams = (qty ?? 0) * servings[si].grams;
  const n = scale(food.per100, grams);
  const toggleFav = () => mutate((s) => {
    const f = s.foods.find((x) => x.id === food.id);
    if (f) f.favorite = !f.favorite; else s.foods.unshift({ ...food, favorite: true });
  });
  const isFav = !!findFood(state, food.id)?.favorite;

  return (
    <div className="stack">
      <div className="row between">
        <div><strong>{food.name}</strong>{food.brand && <div className="tiny muted">{food.brand}</div>}</div>
        <button className="icon-btn" onClick={toggleFav} title="Favorite">{isFav ? '★' : '☆'}</button>
      </div>
      <div className="grid2">
        <NumField label="Quantity" value={qty} onChange={setQty} step={0.25} min={0} />
        <label className="field"><span>Unit</span>
          <select value={si} onChange={(e) => { const i = +e.target.value; setSi(i); setQty(servings[i].grams === 1 ? 100 : 1); }}>
            {servings.map((s, i) => <option key={i} value={i}>{s.grams === 1 ? 'grams' : `${s.label} (${fmt(s.grams)} g)`}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>Meal</span>
        <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>{MEALS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
      </label>
      <NutrientTable n={n} />
      <div className="row">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn primary grow" disabled={grams <= 0} onClick={() => onAdd(grams)}>Add {fmt(grams)} g · {fmt(n.kcal)} kcal</button>
      </div>
    </div>
  );
}

export function NutrientTable({ n }: { n: Nutrients }) {
  return (
    <div className="card flat" style={{ margin: 0 }}>
      <div className="grid4 small">
        <div><div className="muted tiny">kcal</div><strong>{fmt(n.kcal)}</strong></div>
        <div><div className="muted tiny">Protein</div><strong style={{ color: 'var(--protein)' }}>{fmt(n.protein, 1)} g</strong></div>
        <div><div className="muted tiny">Carbs</div><strong style={{ color: 'var(--carbs)' }}>{fmt(n.carbs, 1)} g</strong></div>
        <div><div className="muted tiny">Fat</div><strong style={{ color: 'var(--fat)' }}>{fmt(n.fat, 1)} g</strong></div>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="small muted" style={{ cursor: 'pointer' }}>All nutrients</summary>
        {NUTRIENTS.slice(4).map(({ key, label, unit }) => (
          <div key={key} className="row between small" style={{ padding: '3px 0' }}>
            <span className="muted">{label}</span><span className="num">{n[key] === undefined ? '–' : `${fmt(n[key], n[key]! < 10 ? 1 : 0)} ${unit}`}</span>
          </div>
        ))}
      </details>
    </div>
  );
}

function CreateFood({ onCreated }: { onCreated: (f: Food) => void }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [basis, setBasis] = useState<'100' | 'serving'>('100');
  const [servingLabel, setServingLabel] = useState('1 serving');
  const [servingG, setServingG] = useState<number | undefined>(100);
  const [vals, setVals] = useState<Nutrients>({});
  const set = (k: NutrientKey, v: number | undefined) => setVals((x) => ({ ...x, [k]: v }));
  const valid = name.trim() && vals.kcal !== undefined && (basis === '100' || (servingG ?? 0) > 0);

  const save = () => {
    const factor = basis === '100' ? 1 : 100 / servingG!;
    const per100: Nutrients = {};
    for (const [k, v] of Object.entries(vals)) if (v !== undefined) per100[k as NutrientKey] = v * factor;
    const f: Food = { id: 'c-' + uid(), name: name.trim(), brand: brand.trim() || undefined, per100, source: 'custom',
      servings: servingG && basis === 'serving' ? [{ label: servingLabel, grams: servingG }] : [] };
    mutate((s) => { s.foods.unshift(f); });
    onCreated(f);
  };

  return (
    <div className="stack">
      <div className="grid2">
        <label className="field"><span>Name *</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Brand</span><input value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
      </div>
      <Seg value={basis} onChange={setBasis} options={[{ value: '100', label: 'Values per 100 g' }, { value: 'serving', label: 'Values per serving' }]} />
      {basis === 'serving' && (
        <div className="grid2">
          <label className="field"><span>Serving name</span><input value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} /></label>
          <NumField label="Serving size" suffix="g" value={servingG} onChange={setServingG} />
        </div>
      )}
      <div className="grid2">
        {NUTRIENTS.slice(0, 4).map(({ key, label, unit }) => <NumField key={key} label={label + (key === 'kcal' ? ' *' : '')} suffix={unit} value={vals[key]} onChange={(v) => set(key, v)} step={0.1} />)}
      </div>
      <details>
        <summary className="small muted" style={{ cursor: 'pointer' }}>Fiber, sugar, vitamins & minerals (optional)</summary>
        <div className="grid2" style={{ marginTop: 10 }}>
          {NUTRIENTS.slice(4).map(({ key, label, unit }) => <NumField key={key} label={label} suffix={unit} value={vals[key]} onChange={(v) => set(key, v)} step={0.1} />)}
        </div>
      </details>
      <button className="btn primary block" disabled={!valid} onClick={save}>Save food</button>
    </div>
  );
}

function RecipeBuilder({ onCreated }: { onCreated: (f: Food) => void }) {
  const s = useAppState();
  const [name, setName] = useState('');
  const [portions, setPortions] = useState<number | undefined>(1);
  const [items, setItems] = useState<{ foodId: string; grams: number }[]>([]);
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const t = q.toLowerCase();
    return allFoods(s).filter((f) => f.source !== 'recipe' && f.name.toLowerCase().includes(t)).slice(0, 8);
  }, [s, q]);
  const total = items.reduce((a, i) => a + i.grams, 0);
  const per100 = recipePer100(s, items);
  const valid = name.trim() && items.length > 0 && total > 0;

  const save = () => {
    const p = Math.max(1, portions ?? 1);
    const f: Food = { id: 'r-' + uid(), name: name.trim(), per100, source: 'recipe', ingredients: items,
      servings: [{ label: p === 1 ? 'whole recipe' : `1 portion (1/${p})`, grams: total / p }] };
    mutate((st) => { st.foods.unshift(f); });
    onCreated(f);
  };

  return (
    <div className="stack">
      <div className="grid2">
        <label className="field"><span>Recipe name *</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <NumField label="Portions" value={portions} onChange={setPortions} min={1} />
      </div>
      <div>
        <input placeholder="Add ingredient (search your foods)…" value={q} onChange={(e) => setQ(e.target.value)} />
        {matches.map((f) => (
          <div key={f.id} className="list-item click" onClick={() => { setItems((x) => [...x, { foodId: f.id, grams: f.servings[0]?.grams ?? 100 }]); setQ(''); }}>
            <span className="grow small">{f.name}</span><span className="pill">+ add</span>
          </div>
        ))}
      </div>
      {items.map((it, i) => (
        <div key={i} className="row">
          <span className="grow small">{findFood(s, it.foodId)?.name}</span>
          <input style={{ width: 90 }} type="number" inputMode="decimal" value={it.grams}
            onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, grams: +e.target.value } : y)))} />
          <span className="small muted">g</span>
          <button className="icon-btn" onClick={() => setItems((x) => x.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {items.length > 0 && (
        <p className="small muted">Total {fmt(total)} g · {fmt(scale(per100, total).kcal)} kcal · per portion {fmt(scale(per100, total / Math.max(1, portions ?? 1)).kcal)} kcal</p>
      )}
      <button className="btn primary block" disabled={!valid} onClick={save}>Save recipe</button>
    </div>
  );
}
