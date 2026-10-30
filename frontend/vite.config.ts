import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const BACKEND = 'http://localhost:3005';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // O MESMO motor de nota do servidor: a prévia na tela e a nota gravada
      // não têm como divergir (backend/src/common/nota/motor.ts).
      '@motor': fileURLToPath(new URL('../backend/src/common/nota/motor.ts', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    fs: { allow: ['..'] },
    // Em produção o backend serve o build na MESMA origem (sem CORS). O proxy
    // reproduz isso no desenvolvimento para o cookie de sessão funcionar igual.
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/sso': { target: BACKEND, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
