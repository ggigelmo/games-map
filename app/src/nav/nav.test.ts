import { describe, expect, it } from 'vitest';

import { distanceMeters, type Point } from '../services/geo-math';
import { decodePolyline, type Maneuver, type Route } from '../services/routing';
import { MADRID_SHAPE } from '../services/routing.fixture';
import { computeProgress } from './progress';
import { initialOffRoute, offRouteThreshold, updateOffRoute } from './off-route';
import { cumulativeMeters, snapToRoute } from './snap';

const COORDS = decodePolyline(MADRID_SHAPE);
const CUM = cumulativeMeters(COORDS);
const TOTAL_M = CUM[CUM.length - 1]!;

// ------------------------------------------------------------- utilities
//
// None of this can be tested by driving from a test, so a GPS trace is
// fabricated by walking the real polyline itself.

/** Point on the route at `meters` from the start. */
function pointAt(meters: number): Point {
  const m = Math.max(0, Math.min(TOTAL_M, meters));
  let i = 0;
  while (i < CUM.length - 2 && CUM[i + 1]! < m) i++;
  const seg = CUM[i + 1]! - CUM[i]!;
  const t = seg === 0 ? 0 : (m - CUM[i]!) / seg;
  const a = COORDS[i]!;
  const b = COORDS[i + 1]!;
  return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t };
}

/** Deterministic generator, so a failing test fails the same way again. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Trace walking the route in `stepM` steps, with optional noise in meters. */
function walk(stepM: number, noiseM = 0, seed = 7): Point[] {
  const rand = rng(seed);
  const out: Point[] = [];
  for (let m = 0; m <= TOTAL_M; m += stepM) {
    const p = pointAt(m);
    if (noiseM === 0) {
      out.push(p);
    } else {
      // Random offset in degrees equivalent to +-noiseM meters.
      const dLat = ((rand() - 0.5) * 2 * noiseM) / 110_540;
      const dLng =
        ((rand() - 0.5) * 2 * noiseM) / (111_320 * Math.cos((p.lat * Math.PI) / 180));
      out.push({ lng: p.lng + dLng, lat: p.lat + dLat });
    }
  }
  return out;
}

/**
 * Synthetic maneuvers at known indices. Preferred over real ones so the
 * expected values can be computed by hand and the test checks the logic,
 * not OpenStreetMap's data.
 */
// Derived from the route's real length (218 vertices here): with indices
// pinned by hand, two fell outside the array and ended up out of order, and
// `find` returned a maneuver that didn't exist.
const N = COORDS.length;
const MANEUVER_INDICES = [
  0,
  Math.floor(N * 0.15),
  Math.floor(N * 0.35),
  Math.floor(N * 0.6),
  Math.floor(N * 0.85),
  N - 1,
];

const ROUTE: Route = {
  coordinates: COORDS,
  distanceKm: TOTAL_M / 1000,
  durationS: 600,
  bounds: [
    [0, 0],
    [0, 0],
  ],
  maneuvers: MANEUVER_INDICES.map(
    (beginIndex, i): Maneuver => ({
      instruction: `maneuver ${i}`,
      type: i === 0 ? 1 : 15,
      streetNames: [`Street ${i}`],
      verbal: undefined,
      verbalAlert: undefined,
      multiCue: false,
      beginIndex,
      lengthKm: 0.1,
      timeS: 100,
    }),
  ),
};

// ------------------------------------------------------------------ tests

describe('snapToRoute walking the route', () => {
  it('sticks to the route and advances without going backward', () => {
    const trace = walk(25);
    let index = 0;
    let previousAlong = -1;

    for (const pos of trace) {
      const s = snapToRoute(pos, COORDS, CUM, index);

      // The trace runs ALONG the route, so the perpendicular distance is ~0.
      expect(s.distanceM).toBeLessThan(1);
      // The index must never go backward on a clean run.
      expect(s.index).toBeGreaterThanOrEqual(index);
      expect(s.alongM).toBeGreaterThan(previousAlong);

      index = s.index;
      previousAlong = s.alongM;
    }

    // And it reaches the end: the last point is at the end of the route.
    expect(previousAlong).toBeGreaterThan(TOTAL_M - 30);
  });

  it('finds the position even given a badly wrong index', () => {
    // Real case: you reopen the app after driving for a while. The search
    // window doesn't contain your position and the escape hatch has to kick in.
    const pos = pointAt(TOTAL_M * 0.8);
    const s = snapToRoute(pos, COORDS, CUM, 0);
    expect(s.distanceM).toBeLessThan(5);
    expect(s.alongM).toBeGreaterThan(TOTAL_M * 0.75);
  });
});

describe('computeProgress', () => {
  it('announces the next maneuver, not the one you already passed', () => {
    const m1 = MANEUVER_INDICES[1]!;
    const m2 = MANEUVER_INDICES[2]!;
    // A bit past maneuver 1: the one to announce is maneuver 2.
    const s = snapToRoute(pointAt(CUM[m1 + 3]!), COORDS, CUM, m1);
    const p = computeProgress(s, ROUTE, CUM);
    expect(p.next?.beginIndex).toBe(m2);
  });

  it('measures the distance to the turn', () => {
    const from = MANEUVER_INDICES[1]! + 5;
    const to = MANEUVER_INDICES[2]!;
    const s = snapToRoute(pointAt(CUM[from]!), COORDS, CUM, from);
    const p = computeProgress(s, ROUTE, CUM);
    expect(p.distanceToNextM).toBeCloseTo(CUM[to]! - CUM[from]!, 0);
  });

  it('subtracts what is left of the trip', () => {
    const half = TOTAL_M / 2;
    const s = snapToRoute(pointAt(half), COORDS, CUM, 0);
    const p = computeProgress(s, ROUTE, CUM);
    expect(p.remainingM).toBeCloseTo(TOTAL_M - half, 0);
    // The remaining time drops, but not straight to zero.
    expect(p.remainingS).toBeGreaterThan(0);
    expect(p.remainingS).toBeLessThan(ROUTE.durationS);
  });

  it('on arrival, the pending maneuver is the destination one', () => {
    // Doesn't return null: the arrival maneuver stays AHEAD of you as long
    // as you haven't passed the last vertex, and it's what needs to be shown.
    const s = snapToRoute(pointAt(TOTAL_M), COORDS, CUM, N - 3);
    const p = computeProgress(s, ROUTE, CUM);
    expect(p.next?.beginIndex).toBe(N - 1);
    expect(p.remainingM).toBeLessThan(5);
  });

  it('returns null once there is no maneuver left ahead', () => {
    // A route whose last maneuver is halfway through: past that point there's
    // nothing to announce, and the card has to know how to handle it.
    const short: Route = { ...ROUTE, maneuvers: ROUTE.maneuvers.slice(0, 3) };
    const s = snapToRoute(pointAt(TOTAL_M), COORDS, CUM, N - 3);
    const p = computeProgress(s, short, CUM);
    expect(p.next).toBeNull();
    expect(p.distanceToNextM).toBeCloseTo(p.remainingM, 0);
  });
});

describe('deviation detection', () => {
  it('ties the threshold to the GPS accuracy', () => {
    // This is the reason offRouteThreshold exists: with a fixed 30 m
    // threshold, a fix of +-50 m triggers a deviation without you having
    // moved off the street.
    expect(offRouteThreshold(5)).toBe(35);
    expect(offRouteThreshold(60)).toBe(150);
  });

  it('does not declare a deviation on a clean run', () => {
    let state = initialOffRoute;
    let index = 0;
    for (const pos of walk(25)) {
      const s = snapToRoute(pos, COORDS, CUM, index);
      index = s.index;
      state = updateOffRoute(state, s.distanceM, 10);
      expect(state.off).toBe(false);
    }
  });

  it('does NOT declare a deviation with +-60 m tunnel noise', () => {
    // The false positive that ruins these apps: in an urban canyon the GPS
    // drifts tens of meters and a naive app reroutes nonstop.
    let state = initialOffRoute;
    let index = 0;
    for (const pos of walk(25, 60, 42)) {
      const s = snapToRoute(pos, COORDS, CUM, index);
      index = s.index;
      // The real accuracy is reported: that's what raises the threshold.
      state = updateOffRoute(state, s.distanceM, 60);
    }
    expect(state.off).toBe(false);
  });

  it('declares a deviation after three readings off route, and not before', () => {
    const deviated = 200; // perpendicular meters
    let state = initialOffRoute;

    state = updateOffRoute(state, deviated, 10);
    expect(state.off).toBe(false);
    state = updateOffRoute(state, deviated, 10);
    expect(state.off).toBe(false);
    state = updateOffRoute(state, deviated, 10);
    expect(state.off).toBe(true);
  });

  it('a single bad reading does not count', () => {
    let state = initialOffRoute;
    state = updateOffRoute(state, 200, 10);
    state = updateOffRoute(state, 200, 10);
    // Back on route before the third one: it's forgotten.
    state = updateOffRoute(state, 5, 10);
    expect(state).toEqual(initialOffRoute);
  });

  it('recovers on returning to the route', () => {
    let state = initialOffRoute;
    for (let i = 0; i < 5; i++) state = updateOffRoute(state, 300, 10);
    expect(state.off).toBe(true);
    state = updateOffRoute(state, 8, 10);
    expect(state.off).toBe(false);
  });
});

describe('simulated-run consistency', () => {
  it('the synthetic trace actually follows the route', () => {
    // If this test fails, the ones above prove nothing: it would mean the
    // trace generator isn't following the polyline.
    const trace = walk(200);
    expect(trace.length).toBeGreaterThan(20);
    expect(distanceMeters(trace[0]!, { lng: COORDS[0]![0], lat: COORDS[0]![1] })).toBeLessThan(2);
    const end = COORDS[COORDS.length - 1]!;
    expect(distanceMeters(trace.at(-1)!, { lng: end[0], lat: end[1] })).toBeLessThan(210);
  });
});
