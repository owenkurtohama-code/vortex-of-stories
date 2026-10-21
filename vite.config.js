import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes asset paths work under GitHub Pages project sites (/<repo>/).
export default defineConfig({
  plugins: [react()],
  base: './',
});
