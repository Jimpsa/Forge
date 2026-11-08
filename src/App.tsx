import { useEffect, useState } from 'react';
import { useAppState, useSyncStatus } from './lib/storage';
import { ConfirmHost } from './components/confirm';
import { Today } from './pages/Today';
import { Diet } from './pages/Diet';
import { Train } from './pages/Train';
import { Progress } from './pages/Progress';
import { Profile, ProfileForm } from './pages/Profile';

export type Tab = 'today' | 'diet' | 'train' | 'progress' | 'profile';
const TABS: { key: Tab; label: string; ico: string }[] = [
  { key: 'today', label: 'Today', ico: '◎' },
  { key: 'diet', label: 'Diet', ico: '🍽' },
  { key: 'train', label: 'Train', ico: '🏋' },
  { key: 'progress', label: 'Progress', ico: '📈' },
  { key: 'profile', label: 'Profile', ico: '👤' },
];

export default function App() {
  const s = useAppState();
  const [tab, setTab] = useState<Tab>(s.active ? 'train' : 'today');
  const sync = useSyncStatus();
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);
  useEffect(() => { if (sync.status === 'cloud' && s.active) setTab('train'); }, [sync.status === 'cloud']); // eslint-disable-line react-hooks/exhaustive-deps

  if (sync.status === 'loading') return <div className="app"><div className="empty" style={{ marginTop: '30vh' }}>Loading your data…</div></div>;

  if (!s.onboarded) {
    return (
      <div className="app">
        <div className="page-head"><div><h1>Welcome to Forge</h1><p className="muted small">Diet and training in one place. Set up your profile to get personal calorie and macro targets.</p></div></div>
        <ProfileForm onboarding />
        <ConfirmHost />
      </div>
    );
  }

  return (
    <>
      <main className="app">
        {sync.status === 'error' && <div className="card flat small" style={{ borderColor: 'var(--warn)' }}>⚠️ {sync.message}</div>}
        {tab === 'today' && <Today go={setTab} />}
        {tab === 'diet' && <Diet />}
        {tab === 'train' && <Train />}
        {tab === 'progress' && <Progress />}
        {tab === 'profile' && <Profile />}
      </main>
      <div className="tabs">
        <nav>
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              <span className="ico">{t.ico}</span>{t.label}{t.key === 'train' && s.active ? ' •' : ''}
            </button>
          ))}
        </nav>
      </div>
      <ConfirmHost />
    </>
  );
}
