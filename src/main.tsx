import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { connectRemote } from './lib/storage';
import { IS_ARTIFACT } from './lib/env';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

connectRemote();

if (!IS_ARTIFACT && 'serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
