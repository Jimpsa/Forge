// In-app replacement for window.confirm/alert (which some hosts, e.g. sandboxed frames, block).
import { useEffect, useState } from 'react';
import { tr } from '../i18n';

type Req = { message: string; okLabel: string; cancel: boolean; resolve: (ok: boolean) => void };
let show: ((r: Req) => void) | null = null;

export function askConfirm(message: string, okLabel = 'Yes'): Promise<boolean> {
  return new Promise((resolve) => (show ? show({ message, okLabel, cancel: true, resolve }) : resolve(false)));
}
export function notify(message: string): Promise<boolean> {
  return new Promise((resolve) => (show ? show({ message, okLabel: 'OK', cancel: false, resolve }) : resolve(true)));
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => { show = setReq; return () => { show = null; }; }, []);
  if (!req) return null;
  const done = (ok: boolean) => { req.resolve(ok); setReq(null); };
  return (
    <div className="sheet-backdrop" style={{ zIndex: 60, alignItems: 'center' }} onClick={() => done(false)}>
      <div className="sheet" style={{ maxWidth: 380, borderRadius: 18, margin: 16 }} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <p style={{ marginBottom: 16 }}>{req.message}</p>
        <div className="row">
          {req.cancel && <button className="btn grow" onClick={() => done(false)}>{tr("Cancel")}</button>}
          <button className="btn primary grow" autoFocus onClick={() => done(true)}>{req.okLabel}</button>
        </div>
      </div>
    </div>
  );
}
