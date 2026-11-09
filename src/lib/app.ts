// App identity and platform. Version/build come from CI (FORGE_VERSION / FORGE_BUILD_NUMBER).
import { Capacitor } from '@capacitor/core';

declare const __APP_VERSION__: string;
declare const __APP_BUILD__: number;

export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD = __APP_BUILD__;
export const IS_NATIVE = Capacitor.isNativePlatform();
export const PLATFORM = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
export const REPO_URL = 'https://github.com/jimpsa/Forge';
/** Where CI publishes over-the-air web bundles (GitHub Pages). */
/**
 * Bump this to the build number of the first APK that contains a NATIVE change (new plugin, permission,
 * Capacitor upgrade). Phones on an older APK are then told to install the new app instead of
 * receiving an over-the-air bundle that would need native code they don't have.
 */
export const MIN_NATIVE_BUILD = 7; // build 7: adds the Haptics plugin (vibration)
export const RELEASES_URL = `https://github.com/jimpsa/Forge/releases/latest`;
export const UPDATE_BASE = 'https://jimpsa.github.io/Forge/ota';
