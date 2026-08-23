import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'portable',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist-portable',
    emptyOutDir: true,
    sourcemap: false,
  },
});
