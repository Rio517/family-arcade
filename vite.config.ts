/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Project page on GitHub Pages is served from /<repo>/, so assets must be
// requested with that prefix. Locally (dev/preview) BASE is unset and Vite
// falls back to '/'.
const base = process.env.BASE_PATH ?? '/yahtzee-calculator/';

export default defineConfig({
  base,
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
        name: 'Family Game Console',
        short_name: 'Game Console',
        description: 'A Yahtzee logger and a two-player Ship Battle game.',
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
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/game/**', 'src/state/**', 'src/storage/**', 'src/net/**'],
    },
  },
});
