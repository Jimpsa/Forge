import { useState } from 'react';
import { APP_BUILD, APP_VERSION, IS_NATIVE, PLATFORM, RELEASES_URL } from '../lib/app';
import { applyUpdateNow, checkForUpdate, useUpdateState } from '../lib/updates';
import { BugReport } from './BugReport';
import { tr } from '../i18n';

export function AppInfoCard() {
  const u = useUpdateState();
  const [bug, setBug] = useState(false);
  const status =
    u.status === 'checking' ? 'Checking…' : u.status === 'latest' ? 'You have the latest version ✓' : u.status === 'downloading' ? `Downloading ${u.version}…`
      : u.status === 'ready' ? `Version ${u.version} is ready` : u.status === 'native-required' ? `Version ${u.version} needs a new app install` : u.status === 'error' ? `Couldn’t check: ${u.message}` : '';
  return (
    <div className="card">
      <h2>{tr("App")}</h2>
      <p className="small muted">{tr("Forge")}{' '}{APP_VERSION}{' '}{tr("· build")}{' '}{APP_BUILD} · {PLATFORM}</p>
      {IS_NATIVE && (
        <div className="row" style={{ marginTop: 10 }}>
          <span className="small grow">{status}</span>
          {u.status === 'native-required' ? <a className="btn sm primary" href={RELEASES_URL} target="_blank" rel="noreferrer">{tr("Download")}</a> : u.status === 'ready'
            ? <button className="btn sm primary" onClick={applyUpdateNow}>{tr("Restart & update")}</button>
            : <button className="btn sm" disabled={u.status === 'checking' || u.status === 'downloading'} onClick={() => checkForUpdate()}>{tr("Check for updates")}</button>}
        </div>
      )}
      <button className="btn block" style={{ marginTop: 10 }} onClick={() => setBug(true)}>{tr("🐞 Report a bug")}</button>
      <BugReport open={bug} onClose={() => setBug(false)} />
    </div>
  );
}

export function UpdateBanner() {
  const u = useUpdateState();
  if (u.status === 'native-required') return (
    <div className="card flat row small" style={{ borderColor: 'var(--warn)' }}>
      <span className="grow">{tr("Version")}{' '}{u.version}{' '}{tr("needs a new app install (your data is kept).")}</span>
      <a className="btn sm primary" href={RELEASES_URL} target="_blank" rel="noreferrer">{tr("Download")}</a>
    </div>
  );
  if (u.status !== 'ready') return null;
  return (
    <div className="card flat row small" style={{ borderColor: 'var(--accent)' }}>
      <span className="grow">{tr("✨ Update")}{' '}{u.version}{' '}{tr("ready")}{u.notes ? ` — ${u.notes}` : ''}{tr(". It installs next time you open the app.")}</span>
      <button className="btn sm primary" onClick={applyUpdateNow}>{tr("Restart now")}</button>
    </div>
  );
}
