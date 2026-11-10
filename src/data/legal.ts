// Legal texts live in docs/legal/*.md (also readable on GitHub) and are bundled into the app,
// in English, Finnish and Swedish. The English text is the reference version.
import privacy from '../../docs/legal/privacy-policy.md?raw';
import terms from '../../docs/legal/terms-of-use.md?raw';
import health from '../../docs/legal/health-notice.md?raw';
import privacyFi from '../../docs/legal/privacy-policy.fi.md?raw';
import termsFi from '../../docs/legal/terms-of-use.fi.md?raw';
import healthFi from '../../docs/legal/health-notice.fi.md?raw';
import privacySv from '../../docs/legal/privacy-policy.sv.md?raw';
import termsSv from '../../docs/legal/terms-of-use.sv.md?raw';
import healthSv from '../../docs/legal/health-notice.sv.md?raw';
import { lang } from '../i18n';

/** Bump when the privacy policy or terms change in a way that needs fresh consent. */
export const LEGAL_VERSION = '1.0';

export const LEGAL_DOCS = {
  privacy: { title: 'Privacy policy', text: privacy, fi: privacyFi, sv: privacySv },
  terms: { title: 'Terms of use', text: terms, fi: termsFi, sv: termsSv },
  health: { title: 'Health & safety', text: health, fi: healthFi, sv: healthSv },
} as const;
export type LegalDoc = keyof typeof LEGAL_DOCS;

/** The document in the app's current language. */
export const legalText = (d: LegalDoc) => { const l = lang(); const x = LEGAL_DOCS[d]; return l === 'fi' ? x.fi : l === 'sv' ? x.sv : x.text; };

export const LEGAL_URL = 'https://github.com/jimpsa/Forge/blob/main/docs/legal';
