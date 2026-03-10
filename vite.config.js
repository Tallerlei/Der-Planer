import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Der-Planer/',
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'node',
  },
});
