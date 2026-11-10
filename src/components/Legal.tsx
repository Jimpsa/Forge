import { useState } from 'react';
import { mutate, useAppState, replaceState, defaultState } from '../lib/storage';
import { LEGAL_DOCS, LEGAL_URL, LEGAL_VERSION, type LegalDoc } from '../data/legal';
import { Md } from './Markdown';
import { Sheet } from './ui';
import { askConfirm } from './confirm';
import { LANGS, tr } from '../i18n';
import { settingsOf } from '../lib/settings';
import type { Settings } from '../types';
import { locale } from '../i18n';

export function LegalSheet({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  if (!doc) return null;
  const d = LEGAL_DOCS[doc];
  // Drop the document's own "# Title" line; the sheet shows the title.
  return (
    <Sheet open onClose={onClose} title={d.title}>
      <div className="small legal-text"><Md text={d.text.replace(/^# .*\n/, '')} /></div>
      <p className="tiny muted" style={{ marginTop: 12 }}>{tr("Also available at")}{' '}{LEGAL_URL}</p>
    </Sheet>
  );
}

const Check = ({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <label htmlFor={id} className="row small" style={{ gap: 10, alignItems: 'flex-start', padding: '8px 0', cursor: 'pointer' }}>
    <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flex: 'none' }} />
    <span>{children}</span>
  </label>
);

/** Shown before first use, and again whenever the legal version changes. */
export function ConsentScreen() {
  const s = useAppState();
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [health, setHealth] = useState(false);
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [declined, setDeclined] = useState(false);
  const updated = !!s.consent;
  const hasData = s.entries.length + s.sessions.length + s.body.length + (s.gut?.length ?? 0) > 0;
  const link = (d: LegalDoc, label: string) => <button type="button" className="btn-link" onClick={(e) => { e.preventDefault(); setDoc(d); }}>{label}</button>;
  const accept = () => mutate((st) => { st.consent = { version: LEGAL_VERSION, date: new Date().toISOString(), age16: true, terms: true, health: true }; });

  return (
    <div className="app">
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>{[{ k: 'auto', l: '🌐' }, ...LANGS.map((x) => ({ k: x.key, l: x.label }))].map((x) => <button key={x.k} type="button" className={'btn sm' + ((s.settings?.lang ?? 'auto') === x.k ? ' primary' : '')} onClick={() => mutate((st) => { st.settings = { ...settingsOf(st), lang: x.k as Settings['lang'] }; })}>{x.l}</button>)}</div>
      <div className="page-head"><div><h1>{updated ? tr("We updated our terms") : tr("Welcome to Forge")}</h1><p className="muted small">{updated ? tr("Please review and confirm to keep using the app.") : tr("Before you start, a few things we need your OK for.")}</p></div></div>
      <div className="card">
        <p className="small">{tr("Forge tracks food, training, weight and wellbeing (including gut symptoms and, if you choose, your menstrual cycle). Under EU law this is")}{' '}<strong>{tr("health data")}</strong>{tr(", so we need your explicit consent to process it.")}</p>
        <p className="small" style={{ marginTop: 8 }}>{tr("Today your data is stored")}{' '}<strong>{tr("only on this device")}</strong>{' '}{tr("(or in your Claude account if you use the claude.ai version). No ads, no tracking, never sold.")}</p>
        <div style={{ marginTop: 10 }}>
          <Check id="c-age" checked={age} onChange={setAge}>{tr("I am 16 years or older.")}</Check>
          <Check id="c-terms" checked={terms} onChange={setTerms}>{tr("I accept the")}{' '}{link('terms', 'Terms of use')}{' '}{tr("and have read the")}{' '}{link('privacy', 'Privacy policy')}{' '}{tr("and")}{' '}{link('health', 'Health & safety notice')}.</Check>
          <Check id="c-health" checked={health} onChange={setHealth}>{tr("I explicitly consent to Forge processing my health data (food, body, training, wellbeing, gut and cycle data) to provide the app’s features. I can withdraw this consent at any time in Profile.")}</Check>
        </div>
        <button className="btn primary block" style={{ marginTop: 10 }} disabled={!(age && terms && health)} onClick={accept}>{tr("Agree and continue")}</button>
        <button className="btn ghost block" style={{ marginTop: 6 }} onClick={() => setDeclined(true)}>{tr("I don’t agree")}</button>
        {declined && (
          <div className="card flat small" style={{ marginTop: 10, borderColor: 'var(--warn)' }}>
            {tr("Forge can’t work without processing health data, so the app can’t be used without this consent.")}
            {hasData && <>{' '}{tr("You can delete everything stored in the app:")}
              <button className="btn sm danger" style={{ marginTop: 8, display: 'block' }} onClick={async () => { if (await askConfirm(tr("Delete ALL data stored in Forge on this device? This cannot be undone."), tr("Delete everything"))) replaceState(defaultState()); }}>{tr("Delete all my data")}</button></>}
          </div>
        )}
      </div>
      <LegalSheet doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

/** Profile section: read documents, see/withdraw consent. */
export function LegalCard() {
  const s = useAppState();
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const c = s.consent;
  return (
    <div className="card">
      <h2>{tr("Privacy & legal")}</h2>
      {(Object.keys(LEGAL_DOCS) as LegalDoc[]).map((d) => (
        <button key={d} type="button" className="list-item click" style={{ width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--border)', color: 'inherit', textAlign: 'left' }} onClick={() => setDoc(d)}>
          <span className="grow">{LEGAL_DOCS[d].title}</span><span className="muted">›</span>
        </button>
      ))}
      {c && <p className="tiny muted" style={{ marginTop: 8 }}>{tr("Consent given")}{' '}{new Date(c.date).toLocaleDateString(locale())}{' '}{tr("(version")}{' '}{c.version}{tr("). Export or delete your data under “Your data” above.")}</p>}
      <button className="btn sm ghost danger" style={{ marginTop: 6 }} onClick={async () => {
        if (await askConfirm(tr("Withdraw consent to health-data processing? The app will stop until you consent again. Your data stays on this device unless you delete it."), tr("Withdraw"))) mutate((st) => { st.consent = undefined; });
      }}>{tr("Withdraw consent")}</button>
      <LegalSheet doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
