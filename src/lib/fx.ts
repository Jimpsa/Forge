// Feel-good effects: haptics, sounds, confetti and count-up numbers. All respect the user's settings.
import { useEffect, useRef, useState } from 'react';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { getState } from './storage';
import { settingsOf } from './settings';
import { IS_NATIVE } from './app';

const st = () => settingsOf(getState());
export const reducedMotion = () => document.documentElement.classList.contains('calm');

// ---------- haptics ----------
type Buzz = 'tick' | 'tap' | 'success' | 'double' | 'warning';
export function haptic(kind: Buzz = 'tick') {
  if (!st().vibration) return;
  try {
    if (IS_NATIVE) {
      if (kind === 'success') Haptics.notification({ type: NotificationType.Success });
      else if (kind === 'warning') Haptics.notification({ type: NotificationType.Warning });
      else if (kind === 'double') { Haptics.impact({ style: ImpactStyle.Heavy }); setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }), 180); }
      else Haptics.impact({ style: kind === 'tap' ? ImpactStyle.Medium : ImpactStyle.Light });
    } else {
      const p: Record<Buzz, number | number[]> = { tick: 10, tap: 18, success: [30, 60, 30, 60, 90], double: [120, 80, 120], warning: [60, 40, 60] };
      navigator.vibrate?.(p[kind]);
    }
  } catch { /* not supported */ }
}

// ---------- sounds (off by default) ----------
let audio: AudioContext | undefined;
export function sound(kind: 'tick' | 'success' | 'done') {
  if (!st().sounds) return;
  try {
    audio ??= new AudioContext();
    const notes = kind === 'tick' ? [880] : kind === 'done' ? [660, 880] : [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator(), g = audio!.createGain(), t0 = audio!.currentTime + i * 0.09;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(g).connect(audio!.destination); o.start(t0); o.stop(t0 + 0.2);
    });
  } catch { /* no audio */ }
}

// ---------- confetti ----------
interface P { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; c: string; life: number }
let canvas: HTMLCanvasElement | undefined, parts: P[] = [], running = false;
function ensureCanvas() {
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '80' });
  document.body.appendChild(canvas);
  const size = () => { canvas!.width = innerWidth * devicePixelRatio; canvas!.height = innerHeight * devicePixelRatio; };
  addEventListener('resize', size); size();
  return canvas;
}
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** Burst of confetti from an element (or the top-centre of the screen). */
export function confetti(from?: Element | null, count = 90) {
  if (!st().celebrations || reducedMotion()) return;
  const cv = ensureCanvas(), ctx = cv.getContext('2d')!, d = devicePixelRatio;
  const r = from?.getBoundingClientRect();
  const x = (r ? r.left + r.width / 2 : innerWidth / 2) * d, y = (r ? r.top + r.height / 2 : innerHeight * 0.35) * d;
  const colors = [cssVar('--accent'), cssVar('--accent-2'), cssVar('--good'), cssVar('--protein'), '#ffffff'];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, sp = (6 + Math.random() * 9) * d;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: (5 + Math.random() * 6) * d, h: (3 + Math.random() * 4) * d, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length], life: 0 });
  }
  const tick = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter((p) => p.life < 150 && p.y < cv.height + 40);
    for (const p of parts) {
      p.life++; p.vy += 0.32 * d; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.max(0, 1 - p.life / 150);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (parts.length) requestAnimationFrame(tick); else { running = false; ctx.clearRect(0, 0, cv.width, cv.height); }
  };
  if (!running) { running = true; requestAnimationFrame(tick); }
}

/** One call for a real achievement: confetti + success buzz + chime. */
export function celebrate(from?: Element | null, count = 100) { confetti(from, count); haptic('success'); sound('success'); }

// ---------- count-up numbers ----------
/** Smoothly animates from the previous value to `value` (ease-out). Jumps instantly with reduced motion. */
export function useCountUp(value: number, ms = 800, startFrom?: number) {
  const [shown, setShown] = useState(startFrom ?? value);
  const from = useRef(startFrom ?? value);
  useEffect(() => {
    const start = from.current;
    if (reducedMotion() || start === value) { setShown(value); from.current = value; return; }
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * e;
      setShown(v); from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** Re-triggers a CSS animation class on an element. */
export function replay(el: Element | null | undefined, cls: string) {
  if (!el) return;
  el.classList.remove(cls); void (el as HTMLElement).offsetWidth; el.classList.add(cls);
}
