import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const BUILDER = resolve(here, '../style/build.mjs');

/**
 * Re-ejecuta style/build.mjs cuando cambia, de modo que editar la paleta
 * regenera cyberpunk.json y el HMR de Vite recarga el estilo en el mapa.
 * Un solo `npm run dev` y cero dependencias extra.
 */
function styleBuilder(): Plugin {
  const run = () => {
    try {
      execFileSync(process.execPath, [BUILDER], { stdio: 'inherit' });
    } catch {
      // El error ya se imprimio por stdio; no tumbamos el dev server.
    }
  };
  return {
    name: 'games-map:style-builder',
    buildStart: run,
    configureServer(server: ViteDevServer) {
      server.watcher.add(BUILDER);
      server.watcher.on('change', (file) => {
        if (resolve(file) === BUILDER) run();
      });
    },
  };
}

export default defineConfig({
  plugins: [styleBuilder()],
  // El estilo canonico vive en ../style, fuera de la raiz de Vite.
  server: {
    // El estilo canonico vive en ../style, fuera de la raiz de Vite.
    fs: { allow: [resolve(here, '..')] },
    // Sin fijarlo a fuego: 5173 choca con otros proyectos que ya lo usan.
    port: Number(process.env.PORT) || 5173,
  },
});
