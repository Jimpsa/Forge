import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode artifact` = single file for claude.ai hosting (no outside network: online food search hidden, cloud save on).
// `--mode single` bundles everything into one HTML file (easy to share/host anywhere).
export default defineConfig(({ mode }) => ({
  base: './', // relative paths so it works at any URL (e.g. GitHub Pages sub-path)
  plugins: [react(), ...(mode === 'single' || mode === 'artifact' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'single' ? 'dist-single' : mode === 'artifact' ? 'dist-artifact' : 'dist' },
}));
