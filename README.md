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

## Deploy

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`
(enable it once under Settings → Pages → Source: **GitHub Actions**).
