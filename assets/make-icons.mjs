/**
 * Generates the PWA's PNG icons.
 *
 * iOS uses apple-touch-icon, which has to be a PNG (it doesn't accept SVG).
 * Without it, adding the app to the home screen makes Safari use a
 * screenshot of the page instead, which looks terrible. That's why this
 * exists.
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
 * A fragment of the map: a diagonal yellow highway with a halo, a cyan
 * avenue crossing it, the grid of minor streets in the background, and the
 * player's chevron on top. Same drawing as the map marker, so the icon and
 * the app are recognized as the same thing.
 *
 * It's composed in 512 units and then scaled, so the design doesn't depend
 * on the output size.
 */
function draw(size) {
  const c = new Canvas(size, size, SS);
  const u = size / 512;
  c.fillAll(BG, 1);

  // Background grid
  for (const [x0, y0, x1, y1] of [
    [0, 150, 512, 96],
    [0, 400, 512, 352],
    [120, 0, 200, 512],
    [370, 0, 440, 512],
  ]) {
    c.segment(x0 * u, y0 * u, x1 * u, y1 * u, 7 * u, CYAN_DIM, { glow: 6 * u });
  }

  // Avenue
  c.segment(0, 300 * u, 512 * u, 210 * u, 14 * u, CYAN, { glow: 26 * u });

  // Highway: wide halo, then a hot core. The same two-pass trick the map
  // style uses for roads.
  c.segment(60 * u, 500 * u, 452 * u, 40 * u, 34 * u, YELLOW, { glow: 54 * u });
  c.segment(60 * u, 500 * u, 452 * u, 40 * u, 13 * u, CORE);

  // Player's chevron
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

  // Home-screen icons don't carry transparency: PNG RGB.
  return c.toPNG({ opaque: true });
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, draw(size));
  console.log(`ok  ${file}`);
}
