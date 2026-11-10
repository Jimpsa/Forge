import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/800.css';
import './styles.css';
import { getState } from './lib/storage';
import { applySettings, settingsOf } from './lib/settings';
import { setLang } from './i18n';
import { connectRemote } from './lib/storage';
import { IS_ARTIFACT } from './lib/env';
import { IS_NATIVE } from './lib/app';
import { initUpdates } from './lib/updates';
import { installErrorCapture } from './lib/bugreport';

installErrorCapture();
applySettings(settingsOf(getState())); // before first paint, so there's no colour flash
setLang(settingsOf(getState()).lang);

// Ripple from the touch point on every button (CSS handles the squish).
document.addEventListener('pointerdown', (e) => {
  const b = (e.target as HTMLElement).closest?.('.btn') as HTMLElement | null;
  if (!b || (b as HTMLButtonElement).disabled || document.documentElement.classList.contains('calm')) return;
  const r = b.getBoundingClientRect(), size = Math.max(r.width, r.height), s = document.createElement('span');
  s.className = 'rip'; s.style.width = s.style.height = size + 'px';
  s.style.left = (e.clientX - r.left - size / 2) + 'px'; s.style.top = (e.clientY - r.top - size / 2) + 'px';
  b.appendChild(s); setTimeout(() => s.remove(), 550);
}, { passive: true });

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

connectRemote();
initUpdates();

if (!IS_ARTIFACT && !IS_NATIVE && 'serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
