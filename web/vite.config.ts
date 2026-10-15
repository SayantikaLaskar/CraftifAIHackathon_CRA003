import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787', '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
