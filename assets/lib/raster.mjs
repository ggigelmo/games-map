/**
 * Minimal RGBA rasterizer and PNG encoder, with no dependencies.
 *
 * Used by assets/make-icons.mjs (PWA icons) and assets/make-sprite.mjs (map
 * POI sprite). It exists so we don't have to drag in an SVG build chain just
 * to draw a few dozen glyphs.
 *
 * Antialiasing is not done per primitive: everything is drawn at `ss` times
 * the resolution and downsampled at the end with a box average. This comes
 * out simpler, and quality is uniform across fills, strokes and halos.
 *
 * The buffer stores PREMULTIPLIED alpha, which turns src-over compositing
 * into a per-channel linear interpolation. It gets unpremultiplied when
 * encoding.
 */
import { deflateSync } from 'node:zlib';

export const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** Rectangle as polygon points. */
export const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Box with diagonally chamfered corners: CP2077's visual signature. */
export const chamfered = (x0, y0, x1, y1, c) => [
  [x0 + c, y0],
  [x1, y0],
  [x1, y1 - c],
  [x1 - c, y1],
  [x0, y1],
  [x0, y0 + c],
];

export class Canvas {
  /**
   * @param w  width in logical units
   * @param h  height in logical units
   * @param ss supersampling factor (everything is drawn at w*ss)
   */
  constructor(w, h, ss = 1) {
    this.w = w;
    this.h = h;
    this.ss = ss;
    this.pw = Math.round(w * ss);
    this.ph = Math.round(h * ss);
    // [r, g, b, a] premultiplied, 0..255
    this.px = new Float32Array(this.pw * this.ph * 4);
  }

  fillAll(color, alpha = 1) {
    for (let i = 0; i < this.px.length; i += 4) {
      this.px[i] = color[0] * alpha;
      this.px[i + 1] = color[1] * alpha;
      this.px[i + 2] = color[2] * alpha;
      this.px[i + 3] = 255 * alpha;
    }
  }

  /** src-over on a PHYSICAL pixel. */
  #blendPx(px, py, color, a) {
    if (a <= 0 || px < 0 || py < 0 || px >= this.pw || py >= this.ph) return;
    const k = a > 1 ? 1 : a;
    const inv = 1 - k;
    const i = (py * this.pw + px) * 4;
    this.px[i] = this.px[i] * inv + color[0] * k;
    this.px[i + 1] = this.px[i + 1] * inv + color[1] * k;
    this.px[i + 2] = this.px[i + 2] * inv + color[2] * k;
    this.px[i + 3] = this.px[i + 3] * inv + 255 * k;
  }

  /**
   * Segment of width w in logical units. `glow` adds an outer halo that
   * falls off quadratically: this is what turns a stroke into a neon tube.
   */
  segment(x0, y0, x1, y1, w, color, { alpha = 1, glow = 0 } = {}) {
    const s = this.ss;
    const [ax, ay, bx, by] = [x0 * s, y0 * s, x1 * s, y1 * s];
    const hw = (w * s) / 2;
    const g = glow * s;
    const reach = hw + g;

    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
    const maxX = Math.min(this.pw - 1, Math.ceil(Math.max(ax, bx) + reach));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - reach));
    const maxY = Math.min(this.ph - 1, Math.ceil(Math.max(ay, by) + reach));

    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
        const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
        if (d <= hw) {
          this.#blendPx(x, y, color, alpha);
        } else if (g > 0 && d < reach) {
          const f = 1 - (d - hw) / g;
          this.#blendPx(x, y, color, f * f * alpha * 0.55);
        }
      }
    }
  }

  /** Chain of segments. `close` closes it back onto the first point. */
  polyline(pts, w, color, { alpha = 1, glow = 0, close = false } = {}) {
    const n = pts.length;
    const last = close ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      this.segment(a[0], a[1], b[0], b[1], w, color, { alpha, glow });
    }
  }

  /** Fill using the even-odd rule. */
  polygon(pts, color, { alpha = 1 } = {}) {
    const s = this.ss;
    const p = pts.map(([x, y]) => [x * s, y * s]);
    const xs = p.map((q) => q[0]);
    const ys = p.map((q) => q[1]);
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(this.ph - 1, Math.ceil(Math.max(...ys)));
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(this.pw - 1, Math.ceil(Math.max(...xs)));

    for (let y = minY; y <= maxY; y++) {
      const cy = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        if (this.#inside(p, x + 0.5, cy)) this.#blendPx(x, y, color, alpha);
      }
    }
  }

  #inside(p, x, y) {
    let on = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i];
      const [xj, yj] = p[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
    }
    return on;
  }

  circle(cx, cy, r, color, { alpha = 1, glow = 0 } = {}) {
    // A zero-length segment is already a disc with a halo.
    this.segment(cx, cy, cx, cy, r * 2, color, { alpha, glow });
  }

  /** Downsamples to logical resolution with a box average and unpremultiplies alpha. */
  #resolve() {
    const { ss, w, h } = this;
    const out = new Uint8Array(w * h * 4);
    const n = ss * ss;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = 0; sy < ss; sy++) {
          for (let sx = 0; sx < ss; sx++) {
            const i = ((y * ss + sy) * this.pw + (x * ss + sx)) * 4;
            r += this.px[i];
            g += this.px[i + 1];
            b += this.px[i + 2];
            a += this.px[i + 3];
          }
        }
        r /= n;
        g /= n;
        b /= n;
        a /= n;
        const o = (y * w + x) * 4;
        const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
        if (a > 0.5) {
          const k = 255 / a; // unpremultiply
          out[o] = clamp(r * k);
          out[o + 1] = clamp(g * k);
          out[o + 2] = clamp(b * k);
          out[o + 3] = clamp(a);
        }
      }
    }
    return out;
  }

  /** Resolved pixels, RGBA without premultiplication. */
  pixels() {
    return this.#resolve();
  }

  /** Copies already-resolved RGBA pixels into this canvas (no supersampling). */
  blit(rgba, srcW, srcH, dx, dy) {
    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < srcW; x++) {
        const i = (y * srcW + x) * 4;
        const a = rgba[i + 3] / 255;
        if (a <= 0) continue;
        const o = ((dy + y) * this.pw + (dx + x)) * 4;
        if (dx + x < 0 || dx + x >= this.pw || dy + y < 0 || dy + y >= this.ph) continue;
        // Comes in premultiplied, because that's how this buffer stores it.
        this.px[o] = rgba[i] * a;
        this.px[o + 1] = rgba[i + 1] * a;
        this.px[o + 2] = rgba[i + 2] * a;
        this.px[o + 3] = rgba[i + 3];
      }
    }
  }

  /** @param opaque true = PNG RGB (color type 2); false = RGBA (type 6) */
  toPNG({ opaque = false } = {}) {
    const rgba = this.#resolve();
    const { w, h } = this;
    const ch = opaque ? 3 : 4;
    const raw = Buffer.alloc(h * (w * ch + 1));
    let o = 0;
    for (let y = 0; y < h; y++) {
      raw[o++] = 0; // per-scanline filter byte: 0 = no filter
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        raw[o++] = rgba[i];
        raw[o++] = rgba[i + 1];
        raw[o++] = rgba[i + 2];
        if (!opaque) raw[o++] = rgba[i + 3];
      }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; // bits per channel
    ihdr[9] = opaque ? 2 : 6; // 2 = RGB, 6 = RGBA
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
