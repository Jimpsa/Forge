import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.forge.fitness',
  appName: 'Forge',
  webDir: 'dist',
  android: { backgroundColor: '#0f1115' },
  plugins: {
    // Over-the-air updates in "manual" mode: the app checks GitHub Pages for a newer web bundle itself.
    // statsUrl '' = no telemetry to Capgo's servers; resetWhenUpdate = a newly installed APK clears old OTA bundles.
    CapacitorUpdater: { autoUpdate: false, statsUrl: '', resetWhenUpdate: true },
  },
};

export default config;
