import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/';
  return { base, plugins: [react(), VitePWA({
    registerType: 'prompt', includeAssets: ['icon-192.png', 'icon-512.png'],
    manifest: { name: 'Gym Planner', short_name: 'Gym Planner', lang: 'es',
      description: 'Tus rutinas y entrenamientos', theme_color: '#0c171b', background_color: '#0c171b',
      display: 'standalone', start_url: base, scope: base,
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,png}'], navigateFallback: `${base}index.html` }
  })] };
});
