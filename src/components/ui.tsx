import { trs } from '../i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clamp } from '../lib/util';
import { tr } from '../i18n';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {title && (
          <div className="row between" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>{tr(title)}</h2>
            <button className="icon-btn" onClick={onClose} aria-label={tr("Close")}>✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">{tr(o.label)}</button>
      ))}
    </div>
  );
}

export function Bar({ value, max, color = 'var(--accent)', limit }: { value: number; max: number; color?: string; limit?: boolean }) {
  const pct = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  const over = value > max * 1.05;
  return <div className="bar"><div style={{ width: `${pct}%`, background: over ? (limit ? 'var(--danger)' : 'var(--warn)') : color }} /></div>;
}

let ringId = 0;
/** Progress ring: gradient stroke that sweeps smoothly to its new value. */
export function Ring({ value, max, size = 132, label, sub, warnOver = true }: { value: number; max: number; size?: number; label: string; sub: string; warnOver?: boolean }) {
  const [gid] = useState(() => `ring-g-${++ringId}`);
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  const pct = max > 0 ? clamp(value / max, 0, 1) : 0;
  const over = warnOver && value > max * 1.05;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={trs(`${label} ${sub}`)}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent-2)" /></linearGradient></defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="11" />
      <circle className="arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over ? 'var(--warn)' : tr("url(#{v0})", { v0: gid })} strokeWidth="11"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" transform={tr("rotate(-90 {v0} {v1})", { v0: size / 2, v1: size / 2 })} />
      <text x="50%" y="48%" textAnchor="middle" fill="var(--text)" fontSize={size / 6} fontWeight="800" style={{ fontFamily: 'var(--font-display)' }}>{trs(label)}</text>
      <text x="50%" y="63%" textAnchor="middle" fill="var(--muted)" fontSize={size / 12}>{trs(sub)}</text>
    </svg>
  );
}

/**
 * Number input that keeps what the user types (so clearing a field and typing "75" gives 75, not "075").
 * `required`: an emptied field doesn't report "no value" — it keeps the last valid number and shows it again on blur.
 */
export function NumField({ label, value, onChange, step = 1, min, suffix, required }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; step?: number; min?: number; suffix?: string; required?: boolean }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    // Sync from outside changes only (e.g. a reset), never while the user is mid-edit.
    const parsed = text.trim() === '' ? undefined : Number(text.replace(',', '.'));
    if (parsed !== value && !(focused.current && text.trim() === '')) setText(value === undefined ? '' : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="field">
      <span>{tr(label)}{trs(suffix ? ` (${tr(suffix)})` : '')}</span>
      <input type="text" inputMode="decimal" data-step={step} data-min={min} value={text}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; if (text.trim() === '' && required && value !== undefined) setText(String(value)); }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.,-]/g, '');
          setText(raw);
          if (raw.trim() === '') { if (!required) onChange(undefined); return; }
          const n = Number(raw.replace(',', '.'));
          if (!isNaN(n) && !/[.,]$/.test(raw)) onChange(n);
        }} />
    </label>
  );
}

export const Stat = ({ v, l }: { v: ReactNode; l: ReactNode }) => (
  <div className="stat"><div className="v">{trs(v)}</div><div className="l">{trs(l)}</div></div>
);

export const chartTheme = {
  grid: '#2a2f3a',
  axis: { stroke: '#8b93a7', fontSize: 11, tickLine: false, axisLine: false } as const,
  tooltip: { contentStyle: { background: '#20242d', border: '1px solid #2a2f3a', borderRadius: 10, color: '#e8eaf0' }, labelStyle: { color: '#8b93a7' } },
};

/** Friendly empty screen: small illustration + one clear next step. */
export function EmptyState({ kind, title, text, action }: { kind: 'plate' | 'dumbbell' | 'chart'; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <svg className="illu" viewBox="0 0 120 90" aria-hidden="true">
        <ellipse cx="60" cy="74" rx="46" ry="8" fill="var(--surface-2)" />
        {kind === 'plate' && <>
          <ellipse cx="60" cy="58" rx="40" ry="13" fill="var(--surface-2)" /><ellipse cx="60" cy="54" rx="31" ry="9" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
          <path d="M14 26v22M10 26v8a4 4 0 0 0 8 0v-8M106 26c-4 2-6 7-6 14h6v12" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="52" cy="50" r="5" fill="var(--accent)" /><circle cx="66" cy="52" r="4" fill="var(--good)" /><circle cx="60" cy="46" r="3" fill="var(--accent-2)" />
        </>}
        {kind === 'dumbbell' && <>
          <rect x="22" y="38" width="10" height="28" rx="3" fill="var(--accent)" /><rect x="88" y="38" width="10" height="28" rx="3" fill="var(--accent)" />
          <rect x="14" y="44" width="8" height="16" rx="3" fill="var(--accent-2)" /><rect x="98" y="44" width="8" height="16" rx="3" fill="var(--accent-2)" />
          <rect x="32" y="49" width="56" height="6" rx="3" fill="var(--muted)" />
        </>}
        {kind === 'chart' && <>
          <rect x="24" y="50" width="12" height="18" rx="3" fill="var(--surface-2)" /><rect x="42" y="40" width="12" height="28" rx="3" fill="var(--surface-2)" />
          <rect x="60" y="30" width="12" height="38" rx="3" fill="var(--accent)" /><rect x="78" y="18" width="12" height="50" rx="3" fill="var(--accent-2)" />
          <path d="M22 42l20-10 18 6 32-22" fill="none" stroke="var(--good)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </>}
      </svg>
      <h3 style={{ margin: 0 }}>{trs(title)}</h3>
      <p className="small muted" style={{ maxWidth: 300 }}>{trs(text)}</p>
      {action}
    </div>
  );
}
