import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dos cosas que no son de gusto.
 *
 * 1. El proxy de /api al Nest local en desarrollo. Así el navegador ve un solo
 *    origen y la cookie de sesión —`HttpOnly`, `SameSite=Lax`— viaja igual que en
 *    producción, donde IIS cumple ese papel. Sin el proxy habría que relajar la
 *    cookie sólo para desarrollar, que es la clase de diferencia que hace que
 *    algo ande acá y falle allá.
 *
 * 2. El alias de @todohierro/shared apunta al CÓDIGO FUENTE, no a su dist.
 *    `shared` compila a CommonJS porque lo consume el API, que es CommonJS. Vite
 *    convierte CJS a ESM sólo bajo node_modules, y un workspace enlazado resuelve
 *    a su ruta real, fuera de ahí: Rollup lee el dist como si fuera ESM, no
 *    encuentra ninguna exportación, y el error dice «X is not exported by
 *    shared/dist/index.js» aunque X esté exportado. Compilando el fuente no hay
 *    interoperabilidad en el medio y el problema no puede volver.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@todohierro/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
