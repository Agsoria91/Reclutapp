import { defineConfig } from 'vite';
// base relativa: funciona igual en GitHub Pages (/reclutapp/) que en Vercel (/)
export default defineConfig({ base: './', build: { target: 'es2020' } });
