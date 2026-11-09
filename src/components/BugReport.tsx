import { useState } from 'react';
import { Share } from '@capacitor/share';
import { buildReport, issueUrl } from '../lib/bugreport';
import { IS_NATIVE } from '../lib/app';
import { Sheet } from './ui';

export function BugReport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [done, setDone] = useState('');
  const report = () => buildReport(text);
  const title = () => 'Bug: ' + (text.trim().split('\n')[0].slice(0, 60) || 'something went wrong');

  const share = async () => {
    try {
      if (IS_NATIVE) await Share.share({ title: title(), text: report(), dialogTitle: 'Send bug report' });
      else if (navigator.share) await navigator.share({ title: title(), text: report() });
      else throw new Error('no share');
      setDone('Shared — thanks!');
    } catch { copy(); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(report()); setDone('Copied — paste it to Jimmy or into GitHub.'); } catch { setDone('Couldn’t copy — use the GitHub button instead.'); }
  };

  return (
    <Sheet open={open} onClose={() => { onClose(); setDone(''); }} title="Report a bug">
      <div className="stack">
        <p className="small muted">What did you do, what did you expect, and what happened instead? App version, device, screen and recent error messages are added automatically.</p>
        <textarea rows={5} placeholder="e.g. Tapped ✓ on a set and the rest timer didn’t start" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="grid2">
          <button className="btn" onClick={share}>Share…</button>
          <button className="btn" onClick={copy}>Copy report</button>
        </div>
        <a className="btn primary block" style={{ textAlign: 'center', textDecoration: 'none' }} href={issueUrl(title(), report())} target="_blank" rel="noreferrer">Open as GitHub issue</a>
        {done && <p className="small" style={{ color: 'var(--accent)' }}>{done}</p>}
        <details><summary className="tiny muted" style={{ cursor: 'pointer' }}>Preview report</summary><pre className="tiny muted" style={{ whiteSpace: 'pre-wrap' }}>{report()}</pre></details>
      </div>
    </Sheet>
  );
}
