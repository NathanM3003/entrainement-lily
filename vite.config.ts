/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Chemins relatifs : l'app peut être hébergée dans un sous-dossier (GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg'],
      manifest: {
        name: 'Entraînement de Lily',
        short_name: 'Entraînement',
        description: "Préparation physique pour la saison d'ultimate",
        lang: 'fr',
        start_url: '.',
        display: 'standalone',
        background_color: '#f1f3ee',
        theme_color: '#14213a',
        icons: [{ src: 'icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // Tout est mis en cache : l'app doit marcher au gym sans réseau.
        globPatterns: ['**/*.{js,css,html,svg,json,woff2}'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
});
