/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const alias = {
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
  '@games': fileURLToPath(new URL('./src/games', import.meta.url)),
  '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
  '@test': fileURLToPath(new URL('./src/test', import.meta.url)),
};

// Project page on GitHub Pages is served from /<repo>/, so assets must be
// requested with that prefix. Locally (dev/preview) BASE is unset and Vite
// falls back to '/'.
const base = process.env.BASE_PATH ?? '/yahtzee-calculator/';

export default defineConfig({
  base,
  resolve: { alias },
  plugins: [
    react(),
    // Installable + offline app shell. On a flaky connection the console loads
    // instantly from cache; the peer-to-peer link itself still needs the net,
    // but the app never fails to *open*. Auto-updates when a new build ships.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['calculator.html'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallbackDenylist: [/calculator\.html$/],
      },
      manifest: {
        name: 'Kny-Flores Family Arcade',
        short_name: 'Family Arcade',
        description:
          'The Kny-Flores family arcade — Magic Coins, Rainbow Racer, Ship Battle, Chess, Risk, and Yahtzee.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Agent worktrees under .claude/ carry full repo copies — never scan them.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/games/**', 'src/shared/**'],
    },
  },
});
