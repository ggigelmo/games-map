/**
 * Genera style/cyberpunk.json a partir de una paleta y una tabla de clases.
 *
 * El neon se consigue apilando tres capas de linea por cada clase de carretera:
 *   glow  -> ancha, muy difuminada (line-blur), opacidad baja, color saturado
 *   mid   -> intermedia, algo de blur, color saturado
 *   core  -> fina, sin blur, color aclarado casi blanco = el filamento caliente
 *
 * Ese "halo de color + nucleo blanco" es lo que hace que se lea como neon y no
 * como una raya de color. Cambiar la paleta y volver a ejecutar:
 *   node style/build.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'cyberpunk.json');

// ---------------------------------------------------------------- paleta

const P = {
  bg: '#05060f',
  water: '#01070e',
  waterEdge: '#0b4a5a',
  wood: '#050f0c',
  park: '#050f0c',
  industrial: '#0f0819',
  commercial: '#12081c',
  buildLow: '#070b18',
  buildHigh: '#17456b',
  buildWire: '#1a7d92',
  rail: '#2c1338',
  boundary: '#ff003c',
  textCyan: '#a8f2fb',
  textYellow: '#fcee0a',
  textDim: '#4a6b85',
  halo: '#03040a',
};

/** Aclara un hex hacia blanco. amount 0..1 */
const lighten = (hex, amount) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c + (255 - c) * amount),
  );
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
};

// ------------------------------------------------- tabla de carreteras
//
// w: pares [zoom, ancho_px] del nucleo. glow y mid se derivan multiplicando.
// Sin esto todo el mapa se ve mal a cualquier zoom que no sea el que mirabas.

// coreLighten: cuanto se aclara el nucleo respecto al color del halo. Alto =
// filamento blanco. Ojo: pasarse de 0.4 mata el color y todo se vuelve blanco,
// que fue el primer error de tuneo: parecia un mapa normal con calles claras.
const ROADS = [
  {
    // Son el 80% de las lineas del mapa. Si no retroceden, dominan la imagen
    // y el neon de las vias importantes no se ve.
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
    // Bajo, para que el nucleo siga leyendose AMARILLO y no blanco.
    coreLighten: 0.22,
    w: [[5, 0.6], [9, 1.3], [12, 2.5], [14, 4], [16, 7], [18, 14], [20, 32]],
    glow: { mul: 5.5, opacity: 0.45 },
  },
];

// ------------------------------------------------------------- helpers

/** [[z,v],...] -> expresion interpolate exponencial sobre el zoom */
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

/** Los tres estratos de una clase de carretera. */
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

const fillPoly = (id, sourceLayer, color, opacity, extra = {}) => ({
  id,
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': sourceLayer,
  paint: { 'fill-color': color, 'fill-opacity': opacity },
  ...extra,
});

// -------------------------------------------------------------- capas
//
// El ORDEN es lo que produce el efecto. Todos los glow van abajo para que se
// mezclen entre si; todos los core van arriba para que ninguno quede apagado
// por el halo de una carretera mas importante.

const layers = [
  { id: 'background', type: 'background', paint: { 'background-color': P.bg } },

  // --- suelo: distritos apenas insinuados, con tinte por uso
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

  // --- agua: negra con el borde encendido
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

  // --- tuneles: mismas vias, apagadas y punteadas
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

  // --- ferrocarril
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

  // --- carreteras: 5 clases x 3 estratos, agrupados por estrato
  ...ROADS.map((r) => neonRoad(r, 'glow')),
  ...ROADS.map((r) => neonRoad(r, 'mid')),
  ...ROADS.map((r) => neonRoad(r, 'core')),

  // --- edificios: mas altos = mas cian. Es lo que da la silueta de Night City.
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
        30, '#0c1a34',
        90, P.buildHigh,
        200, '#1f6f96',
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
      'line-opacity': 0.65,
    },
  },

  // --- fronteras administrativas
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

  // --- etiquetas. Mayusculas + letter-spacing = look de HUD.
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
    id: 'poi-label',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'poi',
    minzoom: 16,
    filter: ['<=', ['get', 'rank'], 12],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 10,
      'text-letter-spacing': 0.08,
      'text-transform': 'uppercase',
      'text-anchor': 'top',
      'text-offset': [0, 0.5],
      'text-max-width': 9,
      'text-optional': true,
    },
    paint: {
      'text-color': P.textDim,
      'text-halo-color': P.halo,
      'text-halo-width': 1.4,
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

// -------------------------------------------------------------- estilo

const style = {
  version: 8,
  name: 'Night City',
  metadata: {
    'games-map:generated-by': 'style/build.mjs',
    'games-map:note': 'No editar a mano. Edita build.mjs y vuelve a ejecutarlo.',
  },
  // Teselas sin API key, esquema OpenMapTiles: el mismo que sirve Stadia Maps,
  // asi que cambiar de proveedor es cambiar estas dos URLs.
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  // TODO fase 0b: apuntar a glifos SDF propios (Rajdhani / Chakra Petch)
  // generados con MapLibre Font Maker. OpenFreeMap solo sirve Noto Sans.
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  // NO colorear la luz para tenir los edificios: el shader de fill-extrusion
  // acota el color por abajo con 0.3 * (1 - colorDeLuz), asi que una luz cian
  // (0,1,1) fuerza el canal ROJO a 0.3 y los edificios salen granate. El tinte
  // va en fill-extrusion-color; la luz se queda neutra.
  light: { anchor: 'viewport', color: '#ffffff', intensity: 0.28, position: [1.15, 210, 30] },
  layers,
};

writeFileSync(OUT, JSON.stringify(style, null, 2) + '\n');
console.log(`ok  ${OUT}  (${layers.length} capas)`);
