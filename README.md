# Forge — Diet & Training

An installable web app (PWA) that combines nutrition tracking and strength/cardio training.

- **Diet:** calorie & macro targets (training-day aware), food log by meal, built-in food database,
  Open Food Facts search + barcode lookup, custom foods, recipes, 14 micronutrients, water.
- **Training:** workout templates, set/rep/weight/RPE logging, rest timer, PR detection,
  running & cardio (pace, HR), mixed sessions.
- **Effort:** session RPE × minutes = one training-load number across lifting, running and mixed days.
- **Progress:** weight trend, estimated 1RM per exercise, weekly load & average effort, calories/protein vs target.

Data is stored locally on the device (export/import backup in Profile). All persistence goes through
`src/lib/storage.ts`, so a cloud backend can be swapped in later.

## Develop

```bash
npm install
npm run dev
```

`npm run build` → `dist/` (static site). `npm run build:single` → `dist-single/index.html` (one self-contained file).

## Android app

The Android app is the same web app wrapped with [Capacitor](https://capacitorjs.com) (`android/`).

- **Install / update the app:** every push to `main` builds an APK and attaches it to the
  [latest release](https://github.com/jimpsa/Forge/releases/latest). Download it on the phone and open it.
  Test builds are signed with `android/app/forge-test.keystore`, so new builds install over old ones and keep data.
  (For Google Play, use Play App Signing with a private upload key stored as a GitHub secret.)
- **Over-the-air updates:** the same workflow publishes `ota/version.json` and a zipped web bundle to GitHub Pages.
  Installed apps download it in the background and switch on the next start (`src/lib/updates.ts`).
  If a change needs new native code (plugin, permission, Capacitor upgrade), bump `MIN_NATIVE_BUILD` in
  `src/lib/app.ts` to that build number — older apps are then told to install the new APK instead.
- **Bug reports:** Profile → *Report a bug* shares/copies a report with app version, screen and recent errors,
  or opens a pre-filled GitHub issue.
- **Debug on a phone:** enable USB debugging, connect, open `chrome://inspect` in desktop Chrome.

Local build (needs Android Studio / SDK): `npm run build && npx cap sync android && cd android && ./gradlew assembleRelease`.

## Deploy

Pushing to `main` runs `.github/workflows/release.yml`: web app → GitHub Pages, OTA bundle, and Android APK → GitHub Release.
Enable Pages once under Settings → Pages → Source: **GitHub Actions**.
