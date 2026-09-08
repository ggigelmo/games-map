/**
 * Proyectar tu posicion sobre la ruta.
 *
 * Es la pieza sobre la que se apoya todo lo demas: sin saber en que punto de la
 * ruta estas, no hay siguiente giro, ni distancia restante, ni deteccion de
 * desvio. Logica pura, porque comprobarla de verdad exigiria conducir.
 */
import { distanceMeters, type Point } from '../services/geo-math';

export interface Snapped {
  /** Indice del vertice donde empieza el segmento mas cercano. */
  index: number;
  /** El punto de la ruta mas cercano a ti. */
  point: Point;
  /** Distancia perpendicular a la ruta, en metros. */
  distanceM: number;
  /** Metros de ruta recorridos hasta ese punto. */
  alongM: number;
}

/**
 * Cuantos vertices hacia delante se buscan desde el ultimo indice conocido.
 *
 * La ventana NO es una optimizacion: sin ella, una ruta que pasa dos veces por
 * la misma calle (o una vuelta a la manzana) engancha en el tramo equivocado y
 * las indicaciones se vuelven absurdas.
 */
const WINDOW_FORWARD = 60;

/** Y unos pocos hacia atras, porque el GPS oscila y puedes "retroceder". */
const WINDOW_BACK = 8;

/**
 * Si dentro de la ventana no se encuentra nada mas cerca que esto, se busca en
 * la ruta completa. Cubre el caso de reabrir la app tras conducir un rato, o un
 * salto grande del GPS.
 */
const WINDOW_ESCAPE_M = 200;

/** Distancia acumulada hasta cada vertice. Se calcula una vez por ruta. */
export function cumulativeMeters(coords: [number, number][]): number[] {
  const out = new Array<number>(coords.length);
  out[0] = 0;
  for (let i = 1; i < coords.length; i++) {
    const [aLng, aLat] = coords[i - 1]!;
    const [bLng, bLat] = coords[i]!;
    out[i] = out[i - 1]! + distanceMeters({ lng: aLng, lat: aLat }, { lng: bLng, lat: bLat });
  }
  return out;
}

/**
 * Convierte a metros locales tomando `origin` como centro.
 *
 * A escala de segmento (decenas de metros) la aproximacion plana es exacta de
 * sobra, y evita arrastrar trigonometria esferica a la proyeccion.
 */
function toLocal(p: Point, origin: Point): [number, number] {
  const metersPerDegLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return [(p.lng - origin.lng) * metersPerDegLng, (p.lat - origin.lat) * 110_540];
}

interface Candidate {
  index: number;
  t: number;
  distanceM: number;
}

/** Proyeccion sobre el segmento i → i+1. */
function projectOnSegment(pos: Point, coords: [number, number][], i: number): Candidate {
  const a: Point = { lng: coords[i]![0], lat: coords[i]![1] };
  const b: Point = { lng: coords[i + 1]![0], lat: coords[i + 1]![1] };

  const [px, py] = toLocal(pos, a);
  const [bx, by] = toLocal(b, a);
  const len2 = bx * bx + by * by;

  // Segmento degenerado: vertices duplicados, que Valhalla emite de vez en cuando.
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));

  const dx = px - t * bx;
  const dy = py - t * by;
  return { index: i, t, distanceM: Math.hypot(dx, dy) };
}

function search(pos: Point, coords: [number, number][], from: number, to: number): Candidate {
  let best: Candidate = { index: from, t: 0, distanceM: Infinity };
  for (let i = from; i <= to; i++) {
    const c = projectOnSegment(pos, coords, i);
    if (c.distanceM < best.distanceM) best = c;
  }
  return best;
}

/**
 * Encuentra el punto de la ruta mas cercano a `pos`.
 *
 * @param fromIndex ultimo indice conocido, para centrar la ventana de busqueda
 */
export function snapToRoute(
  pos: Point,
  coords: [number, number][],
  cumulative: number[],
  fromIndex = 0,
): Snapped {
  const last = coords.length - 2; // ultimo indice de segmento valido
  if (last < 0) {
    return { index: 0, point: pos, distanceM: 0, alongM: 0 };
  }

  const from = Math.max(0, Math.min(last, fromIndex - WINDOW_BACK));
  const to = Math.max(from, Math.min(last, fromIndex + WINDOW_FORWARD));

  let best = search(pos, coords, from, to);

  // Valvula de escape: si la ventana no da nada razonable, se mira todo.
  if (best.distanceM > WINDOW_ESCAPE_M && (from > 0 || to < last)) {
    const global = search(pos, coords, 0, last);
    if (global.distanceM < best.distanceM) best = global;
  }

  const a = coords[best.index]!;
  const b = coords[best.index + 1]!;
  const point: Point = {
    lng: a[0] + (b[0] - a[0]) * best.t,
    lat: a[1] + (b[1] - a[1]) * best.t,
  };

  const segLength = cumulative[best.index + 1]! - cumulative[best.index]!;
  return {
    index: best.index,
    point,
    distanceM: best.distanceM,
    alongM: cumulative[best.index]! + segLength * best.t,
  };
}
