/**
 * Genera los iconos PNG de la PWA sin dependencias externas.
 *
 * iOS usa apple-touch-icon (PNG obligatorio: no acepta SVG). Sin el, al anadir
 * la app a la pantalla de inicio Safari pone una captura de la pagina, que se
 * ve fatal. De ahi que esto exista.
 *
 *   node assets/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../app/public/icons');

// ------------------------------------------------------------- rasterizador

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

class Canvas {
  constructor(size) {
    this.n = size;
    this.px = new Float32Array(size * size * 3);
  }

  fill([r, g, b]) {
    for (let i = 0; i < this.px.length; i += 3) {
      this.px[i] = r;
      this.px[i + 1] = g;
      this.px[i + 2] = b;
    }
  }

  /** Mezcla aditiva con cobertura a: asi se suman los halos, como el neon. */
  blend(x, y, [r, g, b], a) {
    if (x < 0 || y < 0 || x >= this.n || y >= this.n || a <= 0) return;
    const i = (y * this.n + x) * 3;
    this.px[i] += (r - this.px[i]) * a;
    this.px[i + 1] += (g - this.px[i + 1]) * a;
    this.px[i + 2] += (b - this.px[i + 2]) * a;
  }

  /**
   * Segmento de grosor w. `glow` anade un halo exterior que decae, que es lo
   * que convierte una raya de color en un tubo de neon.
   */
  segment(x0, y0, x1, y1, w, color, glow = 0) {
    const reach = w / 2 + glow;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - reach));
    const maxX = Math.min(this.n - 1, Math.ceil(Math.max(x0, x1) + reach));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - reach));
    const maxY = Math.min(this.n - 1, Math.ceil(Math.max(y0, y1) + reach));

    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        const d = Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
        if (d <= w / 2) {
          this.blend(x, y, color, Math.min(1, (w / 2 - d) * 1.4 + 0.35));
        } else if (glow > 0 && d <= reach) {
          const f = 1 - (d - w / 2) / glow;
          this.blend(x, y, color, f * f * 0.45);
        }
      }
    }
  }

  /** Poligono relleno por regla par-impar, con supermuestreo 3x3. */
  polygon(pts, color, glow = 0, glowColor = color) {
    if (glow > 0) {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        this.segment(a[0], a[1], b[0], b[1], 2, glowColor, glow);
      }
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(this.n - 1, Math.ceil(Math.max(...ys)));
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(this.n - 1, Math.ceil(Math.max(...xs)));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let hits = 0;
        for (let sy = 0; sy < 3; sy++) {
          for (let sx = 0; sx < 3; sx++) {
            if (this.#inside(pts, x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits++;
          }
        }
        if (hits) this.blend(x, y, color, hits / 9);
      }
    }
  }

  #inside(pts, x, y) {
    let on = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
    }
    return on;
  }

  toPNG() {
    const n = this.n;
    // Cada scanline lleva delante un byte de filtro (0 = sin filtro).
    const raw = Buffer.alloc(n * (n * 3 + 1));
    let o = 0;
    for (let y = 0; y < n; y++) {
      raw[o++] = 0;
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 3;
        raw[o++] = Math.max(0, Math.min(255, Math.round(this.px[i])));
        raw[o++] = Math.max(0, Math.min(255, Math.round(this.px[i + 1])));
        raw[o++] = Math.max(0, Math.min(255, Math.round(this.px[i + 2])));
      }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(n, 0);
    ihdr.writeUInt32BE(n, 4);
    ihdr[8] = 8; // 8 bits por canal
    ihdr[9] = 2; // color type 2 = RGB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// ------------------------------------------------------------------ diseno
//
// Un fragmento de mapa: autovia amarilla en diagonal con halo, dos calles
// cian cruzandola, y el chevron del jugador encima. Legible a 60 px.

const BG = hex('#05060f');
const YELLOW = hex('#fcee0a');
const CYAN = hex('#00f0ff');
const CYAN_DIM = hex('#0e5f6e');
const CORE = hex('#fdf7a0');

function draw(size) {
  const c = new Canvas(size);
  const u = size / 512; // todo en unidades de 512 y escalado
  c.fill(BG);

  // Calles menores: la retícula de fondo
  for (const [x0, y0, x1, y1] of [
    [0, 150, 512, 96],
    [0, 400, 512, 352],
    [120, 0, 200, 512],
    [370, 0, 440, 512],
  ]) {
    c.segment(x0 * u, y0 * u, x1 * u, y1 * u, 7 * u, CYAN_DIM, 6 * u);
  }

  // Avenida cian
  c.segment(0, 300 * u, 512 * u, 210 * u, 14 * u, CYAN, 26 * u);

  // La autovia: halo ancho, luego nucleo caliente
  c.segment(60 * u, 500 * u, 452 * u, 40 * u, 34 * u, YELLOW, 54 * u);
  c.segment(60 * u, 500 * u, 452 * u, 40 * u, 13 * u, CORE, 0);

  // Chevron del jugador, mismo dibujo que el marcador del mapa
  const cx = 256 * u;
  const cy = 268 * u;
  const s = 92 * u;
  c.polygon(
    [
      [cx, cy - s],
      [cx + s * 0.62, cy + s * 0.62],
      [cx, cy + s * 0.22],
      [cx - s * 0.62, cy + s * 0.62],
    ],
    CYAN,
    22 * u,
    CYAN,
  );

  return c.toPNG();
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, draw(size));
  console.log(`ok  ${file}`);
}
