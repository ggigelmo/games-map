/**
 * Generates style/cyberpunk.json from a palette and a class table.
 *
 * The neon look comes from stacking three line layers per road class:
 *   glow  -> wide, heavily blurred (line-blur), low opacity, saturated color
 *   mid   -> intermediate, some blur, saturated color
 *   core  -> thin, no blur, near-white lightened color = the hot filament
 *
 * That "color halo + white core" is what reads as neon instead of a plain
 * colored stripe. Change the palette and rerun:
 *   node style/build.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CLASS_TO_ICON, FALLBACK_ICON, spriteName } from '../assets/lib/poi-icons.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'cyberpunk.json');

// ---------------------------------------------------------------- palette

const P = {
  bg: '#05060f',
  water: '#01070e',
  waterEdge: '#0b4a5a',
  wood: '#050f0c',
  park: '#050f0c',
  industrial: '#0f0819',
  commercial: '#12081c',
  buildLow: '#090d1a',
  buildHigh: '#14314d',
  buildWire: '#0f5666',
  rail: '#2c1338',
  boundary: '#ff003c',
  textCyan: '#a8f2fb',
  textYellow: '#fcee0a',
  textDim: '#4a6b85',
  halo: '#03040a',
};

/** Lightens a hex color toward white. amount 0..1 */
const lighten = (hex, amount) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c + (255 - c) * amount),
  );
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
};

// ------------------------------------------------- road table
//
// w: [zoom, core_width_px] pairs. glow and mid are derived by multiplying.
// Without this, the whole map looks wrong at any zoom other than the one
// you were staring at.

// coreLighten: how much the core is lightened relative to the halo color.
// High = white filament. Watch out: going past 0.4 kills the color and
// everything turns white, which was the first tuning mistake — it looked
// like a normal map with light-colored streets.
const ROADS = [
  {
    // These are 80% of the map's lines. If they don't recede, they dominate
    // the image and the neon on the important roads doesn't show.
    key: 'minor',
    classes: ['minor', 'service', 'track'],
    minzoom: 12,
    color: '#1f2b4d',
    coreLighten: 0.1,
    w: [[12, 0.3], [14, 0.7], [16, 1.8], [18, 4.5], [20, 12]],
    glow: { mul: 3, opacity: 0.1 },
  },
  {
    key: 'tertiary',
    classes: ['tertiary'],
    minzoom: 10,
    color: '#0b6f80',
    coreLighten: 0.3,
    w: [[10, 0.4], [13, 1.0], [16, 2.6], [18, 6.5], [20, 17]],
    glow: { mul: 4, opacity: 0.22 },
  },
  {
    key: 'secondary',
    classes: ['secondary'],
    minzoom: 9,
    color: '#00a8c0',
    coreLighten: 0.32,
    w: [[9, 0.5], [13, 1.3], [16, 3.2], [18, 8], [20, 20]],
    glow: { mul: 4.5, opacity: 0.28 },
  },
  {
    key: 'primary',
    classes: ['primary'],
    minzoom: 7,
    color: '#00e5ff',
    coreLighten: 0.35,
    w: [[7, 0.5], [11, 1.4], [14, 3.0], [16, 5], [18, 11], [20, 26]],
    glow: { mul: 5, opacity: 0.38 },
  },
  {
    key: 'motorway',
    classes: ['motorway', 'trunk'],
    minzoom: 5,
    color: '#fcee0a',
    // Low, so the core still reads as YELLOW and not white.
    coreLighten: 0.22,
    w: [[5, 0.6], [9, 1.3], [12, 2.5], [14, 4], [16, 7], [18, 14], [20, 32]],
    glow: { mul: 5.5, opacity: 0.45 },
  },
];

// ------------------------------------------------------------- helpers

/** [[z,v],...] -> exponential interpolate expression over zoom */
const zoomW = (stops, mul = 1) => [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  ...stops.flatMap(([z, v]) => [z, Number((v * mul).toFixed(2))]),
];

const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel'];

const roadFilter = (classes, extra = []) => [
  'all',
  ['==', ['geometry-type'], 'LineString'],
  ['match', ['get', 'class'], classes, true, false],
  ...extra,
];

/** The three strata of a road class. */
function neonRoad(r, stratum) {
  const base = {
    id: `road-${r.key}-${stratum}`,
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom: r.minzoom,
    filter: roadFilter(r.classes, [notTunnel]),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  };

  if (stratum === 'glow') {
    return {
      ...base,
      paint: {
        'line-color': r.color,
        'line-width': zoomW(r.w, r.glow.mul),
        'line-blur': zoomW(r.w, r.glow.mul * 0.9),
        'line-opacity': r.glow.opacity,
      },
    };
  }
  if (stratum === 'mid') {
    return {
      ...base,
      paint: {
        'line-color': r.color,
        'line-width': zoomW(r.w, 1.7),
        'line-blur': zoomW(r.w, 0.9),
        'line-opacity': 0.4,
      },
    };
  }
  return {
    ...base,
    paint: {
      'line-color': lighten(r.color, r.coreLighten),
      'line-width': zoomW(r.w),
      'line-opacity': 1,
    },
  };
}

/**
 * icon-image: picks the icon based on business type.
 *
 * Classes are grouped by icon so the expression comes out compact (15
 * branches instead of 130) and so the table in assets/lib/poi-icons.mjs
 * stays the single place where it's decided which icon each business gets.
 */
const iconExpr = (() => {
  const byIcon = new Map();
  for (const [cls, icon] of CLASS_TO_ICON) {
    if (!byIcon.has(icon)) byIcon.set(icon, []);
    byIcon.get(icon).push(cls);
  }
  const branches = [];
  for (const [icon, classes] of byIcon) branches.push(classes, spriteName(icon));
  return ['match', ['get', 'class'], ...branches, spriteName(FALLBACK_ICON)];
})();

const fillPoly = (id, sourceLayer, color, opacity, extra = {}) => ({
  id,
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': sourceLayer,
  paint: { 'fill-color': color, 'fill-opacity': opacity },
  ...extra,
});

// -------------------------------------------------------------- layers
//
// The ORDER is what produces the effect. All the glows go at the bottom so
// they blend with each other; all the cores go on top so none of them get
// dimmed by a halo from a more important road.

const layers = [
  { id: 'background', type: 'background', paint: { 'background-color': P.bg } },

  // --- ground: districts barely hinted at, tinted by land use
  fillPoly('landuse-industrial', 'landuse', P.industrial, 0.55, {
    filter: ['match', ['get', 'class'], ['industrial', 'railway'], true, false],
    minzoom: 10,
  }),
  fillPoly('landuse-commercial', 'landuse', P.commercial, 0.45, {
    filter: ['match', ['get', 'class'], ['commercial', 'retail'], true, false],
    minzoom: 10,
  }),
  fillPoly('landcover-wood', 'landcover', P.wood, 0.5, {
    filter: ['match', ['get', 'class'], ['wood', 'grass'], true, false],
  }),
  fillPoly('park', 'park', P.park, 0.45, { minzoom: 8 }),

  // --- water: black with a glowing edge
  fillPoly('water', 'water', P.water, 1, {
    filter: ['!=', ['get', 'brunnel'], 'tunnel'],
  }),
  {
    id: 'water-edge-glow',
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'water',
    minzoom: 6,
    paint: {
      'line-color': P.waterEdge,
      'line-width': zoomW([[6, 2], [12, 5], [16, 10]]),
      'line-blur': zoomW([[6, 3], [12, 7], [16, 14]]),
      'line-opacity': 0.55,
    },
  },
  {
    id: 'water-edge',
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'water',
    minzoom: 6,
    paint: {
      'line-color': lighten(P.waterEdge, 0.45),
      'line-width': zoomW([[6, 0.4], [12, 0.8], [16, 1.4]]),
      'line-opacity': 0.8,
    },
  },
  {
    id: 'waterway',
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'waterway',
    minzoom: 9,
    paint: {
      'line-color': P.waterEdge,
      'line-width': zoomW([[9, 0.5], [14, 1.6], [18, 5]]),
      'line-opacity': 0.7,
    },
  },

  // --- tunnels: same roads, dimmed and dashed
  {
    id: 'road-tunnel',
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom: 13,
    filter: ['all',
      ['==', ['geometry-type'], 'LineString'],
      ['==', ['get', 'brunnel'], 'tunnel'],
    ],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': '#243050',
      'line-width': zoomW([[13, 1], [16, 3], [20, 12]]),
      'line-dasharray': [2, 2],
      'line-opacity': 0.7,
    },
  },

  // --- railway
  {
    id: 'rail',
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom: 11,
    filter: roadFilter(['rail', 'transit']),
    paint: {
      'line-color': lighten(P.rail, 0.35),
      'line-width': zoomW([[11, 0.6], [15, 1.4], [19, 3]]),
      'line-dasharray': [3, 3],
      'line-opacity': 0.8,
    },
  },

  // --- roads: 5 classes x 3 strata, grouped by stratum
  ...ROADS.map((r) => neonRoad(r, 'glow')),
  ...ROADS.map((r) => neonRoad(r, 'mid')),
  ...ROADS.map((r) => neonRoad(r, 'core')),

  // --- buildings: taller = more cyan. This is what gives Night City its silhouette.
  {
    id: 'building-3d',
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': [
        'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 5],
        0, P.buildLow,
        30, '#0d1830',
        90, P.buildHigh,
        200, lighten(P.buildHigh, 0.25),
      ],
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.9,
      'fill-extrusion-vertical-gradient': true,
    },
  },
  {
    id: 'building-wire',
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 15,
    paint: {
      'line-color': P.buildWire,
      'line-width': zoomW([[15, 0.3], [18, 0.7], [20, 1.2]]),
      'line-opacity': 0.5,
    },
  },

  // --- administrative boundaries
  {
    id: 'boundary',
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'boundary',
    filter: ['all', ['<=', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
    paint: {
      'line-color': P.boundary,
      'line-width': zoomW([[3, 0.5], [8, 1.2], [14, 2.5]]),
      'line-dasharray': [4, 3],
      'line-opacity': 0.35,
    },
  },

  // --- labels. Uppercase + letter-spacing = HUD look.
  {
    id: 'water-label',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'water_name',
    minzoom: 8,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': zoomW([[8, 9], [14, 13]]),
      'text-letter-spacing': 0.22,
      'text-transform': 'uppercase',
      'text-max-width': 8,
    },
    paint: {
      'text-color': P.waterEdge,
      'text-halo-color': P.halo,
      'text-halo-width': 1.2,
      'text-opacity': 0.9,
    },
  },
  {
    id: 'road-label',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'transportation_name',
    minzoom: 13,
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': zoomW([[13, 9], [16, 11], [20, 14]]),
      'text-letter-spacing': 0.14,
      'text-transform': 'uppercase',
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'viewport',
      'symbol-spacing': 320,
    },
    paint: {
      'text-color': P.textCyan,
      'text-halo-color': P.halo,
      'text-halo-width': 1.6,
      'text-halo-blur': 0.4,
    },
  },
  {
    // Icon and label in the SAME layer: this way they collide as one unit
    // and a name never ends up orphaned away from its icon.
    id: 'poi',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'poi',
    minzoom: 14,
    filter: [
      'all',
      ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
      // Progressive reveal: important places first, and everything once you
      // zoom in. Low rank = more relevant; no rank gets left for last.
      [
        '<=',
        ['coalesce', ['get', 'rank'], 99],
        ['step', ['zoom'], 4, 15, 8, 16, 14, 17, 25, 18, 100],
      ],
    ],
    layout: {
      'icon-image': iconExpr,
      'icon-size': zoomW([[14, 0.42], [16, 0.6], [18, 0.78], [20, 0.9]]),
      'icon-allow-overlap': false,
      'icon-padding': 2,
      // The most relevant ones win the spot when two icons overlap.
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
      'text-font': ['Noto Sans Regular'],
      'text-size': zoomW([[15, 9], [18, 11]]),
      'text-letter-spacing': 0.08,
      'text-transform': 'uppercase',
      'text-anchor': 'top',
      'text-offset': [0, 1.15],
      'text-max-width': 9,
      // If the name doesn't fit, the name is dropped but the icon stays.
      'text-optional': true,
    },
    paint: {
      'text-color': P.textDim,
      'text-halo-color': P.halo,
      'text-halo-width': 1.4,
      'icon-opacity': zoomW([[14, 0.8], [16, 1]]),
    },
  },
  {
    id: 'place-minor',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'place',
    minzoom: 11,
    filter: ['match', ['get', 'class'],
      ['village', 'hamlet', 'suburb', 'neighbourhood', 'quarter'], true, false],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': zoomW([[11, 10], [16, 13]]),
      'text-letter-spacing': 0.2,
      'text-transform': 'uppercase',
      'text-max-width': 9,
    },
    paint: {
      'text-color': P.textCyan,
      'text-halo-color': P.halo,
      'text-halo-width': 1.5,
      'text-opacity': 0.75,
    },
  },
  {
    id: 'place-town',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'place',
    minzoom: 8,
    filter: ['==', ['get', 'class'], 'town'],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': zoomW([[8, 11], [14, 15]]),
      'text-letter-spacing': 0.22,
      'text-transform': 'uppercase',
      'text-max-width': 9,
    },
    paint: {
      'text-color': lighten(P.textCyan, 0.2),
      'text-halo-color': P.halo,
      'text-halo-width': 1.8,
    },
  },
  {
    id: 'place-city',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'place',
    minzoom: 4,
    filter: ['match', ['get', 'class'], ['city', 'state', 'country'], true, false],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': zoomW([[4, 11], [8, 15], [13, 21]]),
      'text-letter-spacing': 0.28,
      'text-transform': 'uppercase',
      'text-max-width': 8,
    },
    paint: {
      'text-color': P.textYellow,
      'text-halo-color': P.halo,
      'text-halo-width': 2,
      'text-halo-blur': 0.6,
    },
  },
];

// -------------------------------------------------------------- style

const style = {
  version: 8,
  name: 'Night City',
  metadata: {
    'games-map:generated-by': 'style/build.mjs',
    'games-map:note': 'Do not edit by hand. Edit build.mjs and rerun it.',
  },
  // API-key-free tiles, OpenMapTiles schema: the same one Stadia Maps serves,
  // so switching providers just means changing these two URLs.
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  // TODO phase 0b: point to our own SDF glyphs (Rajdhani / Chakra Petch)
  // generated with MapLibre Font Maker. OpenFreeMap only serves Noto Sans.
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  // Our own sprite, generated by assets/make-sprite.mjs. Path relative to the
  // site root, so it works the same in development and on Netlify.
  sprite: '/sprites/night-city',
  // Do NOT color the light to tint the buildings: the fill-extrusion shader
  // clamps color from below with 0.3 * (1 - lightColor), so a cyan light
  // (0,1,1) forces the RED channel to 0.3 and the buildings come out
  // maroon. The tint lives in fill-extrusion-color; the light stays neutral.
  light: { anchor: 'viewport', color: '#00f0ff', intensity: 0.18, position: [1.2, 200, 40] },
  layers,
};

writeFileSync(OUT, JSON.stringify(style, null, 2) + '\n');
console.log(`ok  ${OUT}  (${layers.length} layers)`);
