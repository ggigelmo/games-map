/**
 * Genera el sprite de POI que consume MapLibre.
 *
 *   node assets/make-sprite.mjs
 *
 * Salida en app/public/sprites/:
 *   night-city.png      night-city.json       (pixelRatio 1)
 *   night-city@2x.png   night-city@2x.json    (pixelRatio 2)
 *
 * MapLibre pide `{sprite}.json` + `{sprite}.png`, y anade el sufijo `@2x`
 * cuando devicePixelRatio > 1 (o sea: siempre, en un iPhone). Sin la variante
 * @2x los iconos se ven borrosos en el movil, que es justo donde importa.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas, chamfered } from './lib/raster.mjs';
import { ICONS, PLATE, BORDER, spriteName } from './lib/poi-icons.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../app/public/sprites');
const BASE = 24; // lado del icono en unidades logicas
const PAD = 2; // separacion, para que el halo de un icono no sangre al vecino
const COLS = 5;
const SS = 4; // supermuestreo al dibujar cada glifo

/** Dibuja un icono completo (placa + borde + glifo) a `size` px. */
function renderIcon(def, size) {
  const c = new Canvas(size, size, SS);
  const k = size / BASE; // de unidades logicas a px de este tamano

  // La placa oscura es lo que hace legible el glifo sobre un mapa negro con
  // carreteras de neon cruzando por debajo.
  const plate = chamfered(1.5 * k, 1.5 * k, 22.5 * k, 22.5 * k, 5.5 * k);
  c.polygon(plate, PLATE, { alpha: 0.86 });
  c.polyline(plate, 1.1 * k, BORDER, { close: true, alpha: 0.85, glow: 1.6 * k });

  // El glifo se dibuja en coordenadas 0..24; se escalan envolviendo el lienzo.
  def.draw(scaled(c, k), def.tint);
  return c;
}

/** Envoltorio que multiplica por `k` las coordenadas de las primitivas. */
function scaled(c, k) {
  const pts = (arr) => arr.map(([x, y]) => [x * k, y * k]);
  return {
    segment: (x0, y0, x1, y1, w, col, o = {}) =>
      c.segment(x0 * k, y0 * k, x1 * k, y1 * k, w * k, col, scaleOpts(o, k)),
    polyline: (p, w, col, o = {}) => c.polyline(pts(p), w * k, col, scaleOpts(o, k)),
    polygon: (p, col, o = {}) => c.polygon(pts(p), col, o),
    circle: (cx, cy, r, col, o = {}) => c.circle(cx * k, cy * k, r * k, col, scaleOpts(o, k)),
  };
}

const scaleOpts = (o, k) => (o.glow ? { ...o, glow: o.glow * k } : o);

/** Empaqueta todos los iconos en una hoja y devuelve {png, index}. */
function buildSheet(pixelRatio) {
  const size = BASE * pixelRatio;
  const cell = size + PAD;
  const ids = Object.keys(ICONS);
  const rows = Math.ceil(ids.length / COLS);

  const sheet = new Canvas(COLS * cell - PAD, rows * cell - PAD, 1);
  const index = {};

  ids.forEach((id, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * cell;
    const y = row * cell;

    const icon = renderIcon(ICONS[id], size);
    sheet.blit(icon.pixels(), size, size, x, y);

    index[spriteName(id)] = { x, y, width: size, height: size, pixelRatio };
  });

  return { png: sheet.toPNG(), index, w: sheet.w, h: sheet.h, count: ids.length };
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [ratio, suffix] of [
  [1, ''],
  [2, '@2x'],
]) {
  const { png, index, w, h, count } = buildSheet(ratio);
  writeFileSync(join(OUT_DIR, `night-city${suffix}.png`), png);
  writeFileSync(join(OUT_DIR, `night-city${suffix}.json`), JSON.stringify(index, null, 2) + '\n');
  console.log(`ok  night-city${suffix}  ${w}x${h}px  ${count} iconos  ${png.length} bytes`);
}
