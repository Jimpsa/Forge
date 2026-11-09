import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clamp } from '../lib/util';

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
            <h2 style={{ margin: 0 }}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
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
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">{o.label}</button>
      ))}
    </div>
  );
}

export function Bar({ value, max, color = 'var(--accent)', limit }: { value: number; max: number; color?: string; limit?: boolean }) {
  const pct = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  const over = value > max * 1.05;
  return <div className="bar"><div style={{ width: `${pct}%`, background: over ? (limit ? 'var(--danger)' : 'var(--warn)') : color }} /></div>;
}

export function Ring({ value, max, size = 132, label, sub }: { value: number; max: number; size?: number; label: string; sub: string }) {
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  const pct = max > 0 ? clamp(value / max, 0, 1) : 0;
  const over = value > max * 1.05;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${sub}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over ? 'var(--warn)' : 'var(--accent)'} strokeWidth="10"
        strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="47%" textAnchor="middle" fill="var(--text)" fontSize={size / 6} fontWeight="700">{label}</text>
      <text x="50%" y="62%" textAnchor="middle" fill="var(--muted)" fontSize={size / 12}>{sub}</text>
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
      <span>{label}{suffix ? ` (${suffix})` : ''}</span>
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
  <div className="stat"><div className="v">{v}</div><div className="l">{l}</div></div>
);

export const chartTheme = {
  grid: '#2a2f3a',
  axis: { stroke: '#8b93a7', fontSize: 11, tickLine: false, axisLine: false } as const,
  tooltip: { contentStyle: { background: '#20242d', border: '1px solid #2a2f3a', borderRadius: 10, color: '#e8eaf0' }, labelStyle: { color: '#8b93a7' } },
};
