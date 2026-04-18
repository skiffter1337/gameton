import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api-test': {
    target: 'https://games-test.datsteam.dev',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api-test/, '/api'),
  },
  '/api-final': {
    target: 'https://games.datsteam.dev',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api-final/, '/api'),
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
