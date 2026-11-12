import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/rubik-ai-confused/',
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules/peerjs')) return 'vendor-peer';
          if (id.includes('node_modules/cubejs') || id.includes('kociemba-core')) return 'vendor-solver';
          if (id.includes('node_modules/react')) return 'vendor-react';
        }
      }
    }
  }
});
