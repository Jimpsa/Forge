import { trs } from '../i18n';
import { ShoppingBasket } from 'lucide-react';
import { mutate, useAppState } from '../lib/storage';
import { prepItems } from '../lib/protocol';
import { haptic } from '../lib/fx';
import { tr } from '../i18n';

/** "Coming up" reminders for the gut reset, so you can shop and prepare in real life. */
export function PrepCard({ compact }: { compact?: boolean }) {
  const s = useAppState();
  const items = prepItems(s);
  if (!items.length) return null;
  const done = (id: string) => { mutate((st) => { st.celebrated = { ...st.celebrated, prepDone: [...(st.celebrated?.prepDone ?? []), id] }; }); haptic('tick'); };
  return (
    <div className="card" style={{ borderColor: 'var(--accent-2)' }}>
      <div className="row" style={{ gap: 8 }}><ShoppingBasket size={20} color="var(--accent-2)" aria-hidden="true" /><h2 style={{ margin: 0 }}>{tr("Gut reset · coming up")}</h2></div>
      {items.map((x) => (
        <div key={x.id} className="list-item" style={{ display: 'block' }}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <strong className="small">{trs(x.title)}</strong>
            <button className="btn sm" onClick={() => done(x.id)}>{tr("Got it ✓")}</button>
          </div>
          {!compact && <p className="tiny muted" style={{ marginTop: 3 }}>{trs(x.detail)}</p>}
          <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{x.buy.map((b) => <li key={b}>{trs(b)}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
