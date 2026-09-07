/**
 * Genera los iconos PNG de la PWA.
 *
 * iOS usa apple-touch-icon, que tiene que ser PNG (no acepta SVG). Sin el, al
 * anadir la app a la pantalla de inicio Safari pone una captura de la pagina,
 * que se ve fatal. De ahi que esto exista.
 *
 *   node assets/make-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas, hex } from './lib/raster.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../app/public/icons');
const SS = 3;

const BG = hex('#05060f');
const YELLOW = hex('#fcee0a');
const CYAN = hex('#00f0ff');
const CYAN_DIM = hex('#0e5f6e');
const CORE = hex('#fdf7a0');

/**
 * Un fragmento de mapa: autovia amarilla en diagonal con halo, una avenida
 * cian cruzandola, la reticula de calles menores al fondo, y el chevron del
 * jugador encima. Mismo dibujo que el marcador del mapa, para que el icono y
 * la app se reconozcan como lo mismo.
 *
 * Se compone en unidades de 512 y se escala, asi que el diseno no depende del
 * tamano de salida.
 */
function draw(size) {
  const c = new Canvas(size, size, SS);
  const u = size / 512;
  c.fillAll(BG, 1);

  // Reticula de fondo
  for (const [x0, y0, x1, y1] of [
    [0, 150, 512, 96],
    [0, 400, 512, 352],
    [120, 0, 200, 512],
    [370, 0, 440, 512],
  ]) {
    c.segment(x0 * u, y0 * u, x1 * u, y1 * u, 7 * u, CYAN_DIM, { glow: 6 * u });
  }

  // Avenida
  c.segment(0, 300 * u, 512 * u, 210 * u, 14 * u, CYAN, { glow: 26 * u });

  // Autovia: halo ancho y luego nucleo caliente. El mismo truco de dos pasadas
  // que usa el estilo del mapa para las carreteras.
  c.segment(60 * u, 500 * u, 452 * u, 40 * u, 34 * u, YELLOW, { glow: 54 * u });
  c.segment(60 * u, 500 * u, 452 * u, 40 * u, 13 * u, CORE);

  // Chevron del jugador
  const cx = 256 * u;
  const cy = 268 * u;
  const s = 92 * u;
  const chevron = [
    [cx, cy - s],
    [cx + s * 0.62, cy + s * 0.62],
    [cx, cy + s * 0.22],
    [cx - s * 0.62, cy + s * 0.62],
  ];
  c.polyline(chevron, 3 * u, CYAN, { close: true, glow: 22 * u });
  c.polygon(chevron, CYAN);

  // Los iconos de pantalla de inicio no llevan transparencia: PNG RGB.
  return c.toPNG({ opaque: true });
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, draw(size));
  console.log(`ok  ${file}`);
}
