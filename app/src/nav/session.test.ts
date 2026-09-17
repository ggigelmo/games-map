import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Fix } from '../services/geolocation';
import { decodePolyline, type Maneuver, type Route } from '../services/routing';
import { MADRID_SHAPE } from '../services/routing.fixture';
import { NavSession, type Destination } from './session';

/**
 * The session doesn't talk to the network or touch the DOM, so the whole
 * reroute state machine can be tested with synthetic readings. This is the
 * only part of it that can be verified without driving.
 */

const COORDS = decodePolyline(MADRID_SHAPE);

function routeFrom(coords: [number, number][]): Route {
  const N = coords.length;
  const maneuvers: Maneuver[] = [0, Math.floor(N * 0.4), N - 1].map((beginIndex, i) => ({
    instruction: `maneuver ${i}`,
    type: i === 0 ? 1 : 15,
    streetNames: [`Street ${i}`],
    verbal: undefined,
    verbalAlert: undefined,
    multiCue: false,
    beginIndex,
    lengthKm: 1,
    timeS: 100,
  }));
  return {
    coordinates: coords,
    distanceKm: 5,
    durationS: 300,
    maneuvers,
    bounds: [
      [0, 0],
      [0, 0],
    ],
  };
}

const DESTINATION: Destination = { label: 'Chamartin', lng: -3.6883, lat: 40.453 };

/** Reading at vertex `i` of the route. */
const onRoute = (i: number): Fix => ({
  lng: COORDS[i]![0],
  lat: COORDS[i]![1],
  heading: 90,
  speed: 12,
  accuracy: 8,
  at: performance.now(),
});

/** Reading deviated ~400 m from vertex `i`. */
const deviated = (i: number): Fix => ({ ...onRoute(i), lat: COORDS[i]![1] + 0.0036 });

describe('automatic reroute', () => {
  let nav: NavSession;
  let requests: Destination[];

  beforeEach(() => {
    // performance.now() has to be controllable: the brake between reroutes
    // depends on it, and without a fake clock the test would take 15 real
    // seconds.
    vi.useFakeTimers();
    nav = new NavSession();
    requests = [];
    nav.onNeedsReroute = (_from, to) => requests.push(to);
    nav.preview(routeFrom(COORDS), DESTINATION);
    nav.start();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requests nothing while you stay on the route', () => {
    for (const i of [0, 20, 40, 60, 80]) nav.consume(onRoute(i));
    expect(requests).toHaveLength(0);
    expect(nav.rerouting).toBe(false);
  });

  it('requests a new route once the deviation is declared, with the original destination', () => {
    nav.consume(deviated(50));
    nav.consume(deviated(50));
    expect(requests).toHaveLength(0); // not yet: three are needed

    nav.consume(deviated(50));
    expect(requests).toEqual([DESTINATION]);
    expect(nav.rerouting).toBe(true);
  });

  it('does not request another while the first is in flight', () => {
    for (let i = 0; i < 8; i++) nav.consume(deviated(50));
    expect(requests).toHaveLength(1);
  });

  it('respects the 15 s minimum between attempts if the first one fails', () => {
    for (let i = 0; i < 3; i++) nav.consume(deviated(50));
    expect(requests).toHaveLength(1);

    nav.rerouteFailed();
    expect(nav.rerouting).toBe(false);

    // Just before the limit: not yet.
    vi.advanceTimersByTime(14_000);
    nav.consume(deviated(50));
    expect(requests).toHaveLength(1);

    // Past the limit: it retries.
    vi.advanceTimersByTime(2_000);
    nav.consume(deviated(50));
    expect(requests).toHaveLength(2);
  });

  it('the new route brings you back onto it without leaving navigation', () => {
    for (let i = 0; i < 3; i++) nav.consume(deviated(50));

    // New route that starts where you are: a segment from the deviation.
    const newRoute = routeFrom(COORDS.slice(50));
    nav.replaceRoute(newRoute);

    expect(nav.rerouting).toBe(false);
    expect(nav.phase).toBe('navigating');
    expect(nav.route).toBe(newRoute);

    // And the deviation state resets: on the new route you're within it.
    const updates: boolean[] = [];
    nav.onUpdate = (u) => updates.push(u.offRoute);
    nav.consume({ ...onRoute(50) });
    expect(updates).toEqual([false]);
  });

  it('STOP cuts off the reroute and forgets the destination', () => {
    for (let i = 0; i < 3; i++) nav.consume(deviated(50));
    expect(nav.rerouting).toBe(true);

    nav.stop();
    expect(nav.phase).toBe('idle');
    expect(nav.rerouting).toBe(false);
    expect(nav.destination).toBeNull();

    // And a later reading doesn't reactivate anything.
    nav.consume(deviated(50));
    expect(requests).toHaveLength(1);
  });

  it('replaceRoute does nothing if you have already stopped', () => {
    nav.stop();
    nav.replaceRoute(routeFrom(COORDS));
    expect(nav.phase).toBe('idle');
    expect(nav.route).toBeNull();
  });

  it('in preview it does not consume readings or reroute', () => {
    const other = new NavSession();
    const requested: Destination[] = [];
    other.onNeedsReroute = (_f, to) => requested.push(to);
    other.preview(routeFrom(COORDS), DESTINATION);
    // Without start(): you're still deciding, moving shouldn't trigger anything.
    for (let i = 0; i < 5; i++) other.consume(deviated(50));
    expect(requested).toHaveLength(0);
  });
});
