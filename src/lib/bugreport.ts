// Collects context for bug reports: app version, device, current screen and recent errors.
import { APP_BUILD, APP_VERSION, PLATFORM, REPO_URL } from './app';

const errors: string[] = [];
const MAX = 15;
const push = (msg: string) => { errors.push(`${new Date().toISOString().slice(11, 19)} ${msg}`.slice(0, 500)); if (errors.length > MAX) errors.shift(); };

export function installErrorCapture() {
  window.addEventListener('error', (e) => push(`Error: ${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => push(`Unhandled: ${String((e.reason && (e.reason.message ?? e.reason)) ?? e.reason)}`));
  const orig = console.error;
  console.error = (...args: unknown[]) => { push('console.error: ' + args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')); orig(...args); };
}

let screen = 'today';
export const setScreen = (s: string) => { screen = s; };

export function buildReport(description: string) {
  return [
    `**What happened**`,
    description.trim() || '(no description)',
    '',
    `**Details**`,
    `- App: Forge ${APP_VERSION} (build ${APP_BUILD}) on ${PLATFORM}`,
    `- Screen: ${screen}`,
    `- Device: ${navigator.userAgent}`,
    `- Screen size: ${window.innerWidth}×${window.innerHeight}`,
    `- Time: ${new Date().toISOString()}`,
    '',
    `**Recent errors**`,
    errors.length ? errors.map((e) => '- ' + e).join('\n') : '- none',
  ].join('\n');
}

export const issueUrl = (title: string, body: string) =>
  `${REPO_URL}/issues/new?labels=bug&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body.slice(0, 6000))}`;
