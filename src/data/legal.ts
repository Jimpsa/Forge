// Legal texts live in docs/legal/*.md (also readable on GitHub) and are bundled into the app.
import privacy from '../../docs/legal/privacy-policy.md?raw';
import terms from '../../docs/legal/terms-of-use.md?raw';
import health from '../../docs/legal/health-notice.md?raw';

/** Bump when the privacy policy or terms change in a way that needs fresh consent. */
export const LEGAL_VERSION = '1.0';

export const LEGAL_DOCS = {
  privacy: { title: 'Privacy policy', text: privacy },
  terms: { title: 'Terms of use', text: terms },
  health: { title: 'Health & safety', text: health },
} as const;
export type LegalDoc = keyof typeof LEGAL_DOCS;

export const LEGAL_URL = 'https://github.com/jimpsa/Forge/blob/main/docs/legal';
