/** True in the build hosted on claude.ai, where outside network calls (Open Food Facts) and the camera are blocked. */
export const IS_ARTIFACT = import.meta.env.MODE === 'artifact';
