/**
 * Generates the POI sprite that MapLibre consumes.
 *
 *   node assets/make-sprite.mjs
 *
 * Output in app/public/sprites/:
 *   poi-sprite.png      poi-sprite.json       (pixelRatio 1)
 *   poi-sprite@2x.png   poi-sprite@2x.json    (pixelRatio 2)
 *
 * MapLibre requests `{sprite}.json` + `{sprite}.png`, and adds the `@2x`
 * suffix when devicePixelRatio > 1 (i.e. always, on an iPhone). Without the
 * @2x variant the icons look blurry on mobile, which is exactly where it
 * matters.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas, chamfered } from './lib/raster.mjs';
import { ICONS, PLATE, BORDER, spriteName } from './lib/poi-icons.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../app/public/sprites');
const BASE = 24; // icon side in logical units
const PAD = 2; // spacing, so one icon's halo doesn't bleed into its neighbor
const COLS = 5;
const SS = 4; // supersampling while drawing each glyph

/** Draws a full icon (plate + border + glyph) at `size` px. */
function renderIcon(def, size) {
  const c = new Canvas(size, size, SS);
  const k = size / BASE; // from logical units to px at this size

  // The dark plate is what makes the glyph legible over a black map with
  // neon roads crossing underneath.
  const plate = chamfered(1.5 * k, 1.5 * k, 22.5 * k, 22.5 * k, 5.5 * k);
  c.polygon(plate, PLATE, { alpha: 0.86 });
  c.polyline(plate, 1.1 * k, BORDER, { close: true, alpha: 0.85, glow: 1.6 * k });

  // The glyph is drawn in 0..24 coordinates; they get scaled by wrapping the canvas.
  def.draw(scaled(c, k), def.tint);
  return c;
}

/** Wrapper that multiplies primitive coordinates by `k`. */
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

/** Packs all the icons into one sheet and returns {png, index}. */
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
  writeFileSync(join(OUT_DIR, `poi-sprite${suffix}.png`), png);
  writeFileSync(join(OUT_DIR, `poi-sprite${suffix}.json`), JSON.stringify(index, null, 2) + '\n');
  console.log(`ok  poi-sprite${suffix}  ${w}x${h}px  ${count} icons  ${png.length} bytes`);
}
