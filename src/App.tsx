import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, House, MessageCircle, TrendingUp, User, Utensils, type LucideIcon } from 'lucide-react';
import { mutate, useAppState, useSyncStatus } from './lib/storage';
import { applySettings, settingsOf } from './lib/settings';
import { newlyEarned, perfectDay } from './lib/achievements';
import { celebrate } from './lib/fx';
import { ToastHost, toast } from './components/Toast';
import { ConsentScreen } from './components/Legal';
import { useProtocolPlanSync } from './pages/MealPlanner';
import { LEGAL_VERSION } from './data/legal';
import { Icon } from './components/Icon';
import { today } from './lib/util';
import { ConfirmHost } from './components/confirm';
import { UpdateBanner } from './components/AppInfo';
import { setScreen } from './lib/bugreport';
import { Today } from './pages/Today';
import { Diet } from './pages/Diet';
import { Train } from './pages/Train';
import { Progress } from './pages/Progress';
import { Profile, ProfileForm } from './pages/Profile';
import { Coach } from './pages/Coach';
import { setLang, tr } from './i18n';

export type Tab = 'today' | 'diet' | 'train' | 'coach' | 'progress' | 'profile';
const TABS: { key: Tab; label: string; Ico: LucideIcon }[] = [
  { key: 'today', label: 'Today', Ico: House },
  { key: 'diet', label: 'Diet', Ico: Utensils },
  { key: 'train', label: 'Train', Ico: Dumbbell },
  { key: 'coach', label: 'Coach', Ico: MessageCircle },
  { key: 'progress', label: 'Progress', Ico: TrendingUp },
  { key: 'profile', label: 'Profile', Ico: User },
];

/** Watches state for newly earned badges and perfect days, and celebrates each exactly once. */
function useCelebrations() {
  const s = useAppState();
  const earned = useMemo(() => (s.onboarded ? newlyEarned(s) : undefined), [s]);
  const pd = useMemo(() => (s.onboarded ? perfectDay(s) : undefined), [s]);
  useEffect(() => {
    if (!earned) return;
    if (earned.firstRun) { mutate((st) => { st.celebrated = { ...st.celebrated, badges: Object.fromEntries(earned.all.map((b) => [b.id, today()])) }; }); return; }
    if (!earned.fresh.length) return;
    mutate((st) => { st.celebrated = { ...st.celebrated, badges: { ...st.celebrated?.badges, ...Object.fromEntries(earned.fresh.map((b) => [b.id, today()])) } }; });
    earned.fresh.forEach((b, i) => setTimeout(() => { toast({ icon: <Icon name={b.icon} size={20} />, title: tr("Badge earned: {v0}", { v0: b.name }), sub: b.desc }); if (i === 0) celebrate(null, 80); }, i * 600));
  }, [earned]);
  useEffect(() => {
    if (!pd?.perfect || s.celebrated?.perfectDays?.includes(today())) return;
    mutate((st) => { st.celebrated = { ...st.celebrated, perfectDays: [...(st.celebrated?.perfectDays ?? []), today()].slice(-120) }; });
    toast({ title: tr("Perfect day ✨"), sub: tr("Calories, protein, water and check-in all done.") });
    celebrate(null, 120);
  }, [pd?.perfect]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function App() {
  const s = useAppState();
  const [tab, setTab] = useState<Tab>(s.active ? 'train' : 'today');
  const sync = useSyncStatus();
  const settings = settingsOf(s);
  setLang(settings.lang); // synchronous, so this render already uses the chosen language
  useEffect(() => {
    applySettings(settings);
    const mq = [matchMedia('(prefers-color-scheme: light)'), matchMedia('(prefers-reduced-motion: reduce)')];
    const on = () => applySettings(settings);
    mq.forEach((m) => m.addEventListener('change', on));
    return () => mq.forEach((m) => m.removeEventListener('change', on));
  }, [settings.palette, settings.mode, settings.motion]); // eslint-disable-line react-hooks/exhaustive-deps
  useCelebrations();
  useProtocolPlanSync();
  const tabIndex = TABS.findIndex((x) => x.key === tab);
  useEffect(() => { window.scrollTo(0, 0); setScreen(tab); }, [tab]);
  useEffect(() => { if (sync.status === 'cloud' && s.active) setTab('train'); }, [sync.status === 'cloud']); // eslint-disable-line react-hooks/exhaustive-deps

  if (sync.status === 'loading') return <div className="app"><div className="empty" style={{ marginTop: '30vh' }}>{tr("Loading your data…")}</div></div>;

  if (!s.consent || s.consent.version !== LEGAL_VERSION) return <><ConsentScreen /><ConfirmHost /></>;

  if (!s.onboarded) {
    return (
      <div className="app">
        <div className="page-head"><div><h1>{tr("Welcome to Forge")}</h1><p className="muted small">{tr("Diet and training in one place. Set up your profile to get personal calorie and macro targets.")}</p></div></div>
        <ProfileForm onboarding />
        <ConfirmHost />
      </div>
    );
  }

  return (
    <>
      <main className="app">
        <UpdateBanner />
        {sync.status === 'error' && <div className="card flat small" style={{ borderColor: 'var(--warn)' }}>⚠️ {sync.message}</div>}
        {tab === 'today' && <Today go={setTab} />}
        {tab === 'diet' && <Diet />}
        {tab === 'train' && <Train />}
        {tab === 'coach' && <Coach />}
        {tab === 'progress' && <Progress />}
        {tab === 'profile' && <Profile />}
      </main>
      <div className="tabs">
        <nav>
          <div className="tab-pill" style={{ width: `calc(100% / ${TABS.length})`, transform: `translateX(${tabIndex * 100}%)` }} />
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'on' : ''} aria-current={tab === t.key ? 'page' : undefined} onClick={() => setTab(t.key)}>
              <span className="ico"><t.Ico /></span>{tr(t.label)}{t.key === 'train' && s.active ? ' •' : ''}
            </button>
          ))}
        </nav>
      </div>
      <ConfirmHost />
      <ToastHost />
    </>
  );
}
