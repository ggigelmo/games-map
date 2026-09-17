/**
 * Projecting your position onto the route.
 *
 * This is the piece everything else rests on: without knowing which point of
 * the route you're at, there's no next turn, no remaining distance, and no
 * off-route detection. Pure logic, because really testing it would require
 * driving.
 */
import { distanceMeters, type Point } from '../services/geo-math';

export interface Snapped {
  /** Index of the vertex where the closest segment starts. */
  index: number;
  /** The point on the route closest to you. */
  point: Point;
  /** Perpendicular distance to the route, in meters. */
  distanceM: number;
  /** Meters of route traveled up to that point. */
  alongM: number;
}

/**
 * How many vertices forward to search from the last known index.
 *
 * The window is NOT an optimization: without it, a route that passes through
 * the same street twice (or a loop around the block) latches onto the wrong
 * segment and the directions become absurd.
 */
const WINDOW_FORWARD = 60;

/** And a few backward, because GPS oscillates and you can appear to "go backward". */
const WINDOW_BACK = 8;

/**
 * If nothing closer than this is found within the window, the whole route is
 * searched. This covers reopening the app after driving for a while, or a
 * large GPS jump.
 */
const WINDOW_ESCAPE_M = 200;

/** Cumulative distance up to each vertex. Calculated once per route. */
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
 * Converts to local meters using `origin` as the center.
 *
 * At segment scale (tens of meters) the flat approximation is more than exact
 * enough, and it avoids dragging spherical trigonometry into the projection.
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

/** Projection onto segment i → i+1. */
function projectOnSegment(pos: Point, coords: [number, number][], i: number): Candidate {
  const a: Point = { lng: coords[i]![0], lat: coords[i]![1] };
  const b: Point = { lng: coords[i + 1]![0], lat: coords[i + 1]![1] };

  const [px, py] = toLocal(pos, a);
  const [bx, by] = toLocal(b, a);
  const len2 = bx * bx + by * by;

  // Degenerate segment: duplicate vertices, which Valhalla emits from time to time.
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
 * Finds the point on the route closest to `pos`.
 *
 * @param fromIndex last known index, used to center the search window
 */
export function snapToRoute(
  pos: Point,
  coords: [number, number][],
  cumulative: number[],
  fromIndex = 0,
): Snapped {
  const last = coords.length - 2; // last valid segment index
  if (last < 0) {
    return { index: 0, point: pos, distanceM: 0, alongM: 0 };
  }

  const from = Math.max(0, Math.min(last, fromIndex - WINDOW_BACK));
  const to = Math.max(from, Math.min(last, fromIndex + WINDOW_FORWARD));

  let best = search(pos, coords, from, to);

  // Escape valve: if the window doesn't yield anything reasonable, look at everything.
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
