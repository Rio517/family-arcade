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
const base = process.env.BASE_PATH ?? '/'; // custom domain serves from the root

export default defineConfig({
  base,
  resolve: { alias },
  // Ship meshes are bundled, not fetched: importing a .glb yields a hashed URL
  // in dist/, which keeps the offline invariant (no runtime downloads).
  assetsInclude: ['**/*.glb'],
  plugins: [
    react(),
    // Installable + offline app shell. On a flaky connection the console loads
    // instantly from cache; the peer-to-peer link itself still needs the net,
    // but the app never fails to *open*. Auto-updates when a new build ships.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['calculator.html'],
      workbox: {
        // .glb belongs here: ship meshes are bundled assets, and without them
        // in the precache the app would fetch a model at runtime the first
        // time someone opens the 3D board — which is exactly the offline
        // invariant this project doesn't break.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,glb,webp}'],
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
          // Raster fallbacks: iOS ignores SVG icons, and some Android launchers
          // want concrete PNG sizes for the home-screen install.
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
    // `preview-b.html` is the mid-battle harness the screenshot run uses to
    // reach the Ship Battle board without playing a whole game. It is built
    // only when BUILD_HARNESS is set (npm run shots does that), so the
    // published PWA never carries a stray dev page.
    rollupOptions: process.env.BUILD_HARNESS
      ? {
          input: {
            index: fileURLToPath(new URL('./index.html', import.meta.url)),
            'preview-b': fileURLToPath(new URL('./preview-b.html', import.meta.url)),
            'preview-ship': fileURLToPath(new URL('./preview-ship.html', import.meta.url)),
            'preview-carrier': fileURLToPath(new URL('./preview-carrier.html', import.meta.url)),
            'preview-battleship': fileURLToPath(
              new URL('./preview-battleship.html', import.meta.url),
            ),
          },
        }
      : {},
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
