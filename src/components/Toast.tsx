import { useEffect, useState, type ReactNode } from 'react';
import { tr } from '../i18n';

type T = { id: number; icon?: ReactNode; title: string; sub?: string };
let push: ((t: Omit<T, 'id'>) => void) | null = null;
let n = 0;
export const toast = (t: Omit<T, 'id'>) => push?.(t);

export function ToastHost() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => { push = (t) => setItems((x) => [...x, { ...t, id: ++n }]); return () => { push = null; }; }, []);
  useEffect(() => {
    if (!items.length) return;
    const id = setTimeout(() => setItems((x) => x.slice(1)), 3800);
    return () => clearTimeout(id);
  }, [items]);
  const t = items[0];
  if (!t) return null;
  return (
    <div className="toast" key={t.id} role="status" onClick={() => setItems((x) => x.slice(1))}>
      {t.icon && <div className="medal" style={{ width: 40, height: 40 }}>{t.icon}</div>}
      <div><strong>{tr(t.title)}</strong>{t.sub && <div className="tiny muted">{tr(t.sub)}</div>}</div>
    </div>
  );
}
