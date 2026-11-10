// Lightweight translations: the English text is the key (gettext-style), so untranslated text simply
// falls back to English. Variables use {name}: t('Day {n} of {total}', { n: 3, total: 35 }).
import fi from './fi.json';
import sv from './sv.json';

export type Lang = 'en' | 'fi' | 'sv';
export type LangSetting = Lang | 'auto';
export const LANGS: { key: Lang; label: string }[] = [{ key: 'en', label: 'English' }, { key: 'fi', label: 'Suomi' }, { key: 'sv', label: 'Svenska' }];

const DICTS: Record<Exclude<Lang, 'en'>, Record<string, string>> = { fi, sv };
let current: Lang = 'en';

export function detectLang(): Lang {
  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language]) ?? [];
  for (const l of langs) { const c = l.toLowerCase().slice(0, 2); if (c === 'fi' || c === 'sv' || c === 'en') return c as Lang; }
  return 'en';
}
export function setLang(setting: LangSetting | undefined) {
  current = !setting || setting === 'auto' ? detectLang() : setting;
  document.documentElement.lang = current;
}
export const lang = () => current;
/** BCP-47 locale for dates and numbers. */
export const locale = () => (current === 'fi' ? 'fi-FI' : current === 'sv' ? 'sv-FI' : 'en-GB');

export function t(text: string, vars?: Record<string, string | number>): string {
  let s = current === 'en' ? text : DICTS[current][text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
export const tr = t;
