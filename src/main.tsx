import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { connectRemote } from './lib/storage';
import { IS_ARTIFACT } from './lib/env';
import { IS_NATIVE } from './lib/app';
import { initUpdates } from './lib/updates';
import { installErrorCapture } from './lib/bugreport';

installErrorCapture();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

connectRemote();
initUpdates();

if (!IS_ARTIFACT && !IS_NATIVE && 'serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
