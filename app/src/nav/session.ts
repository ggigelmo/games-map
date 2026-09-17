/**
 * Navigation state. The only impure part of `nav/`: holds the state,
 * consumes GPS readings, calls the pure functions, and notifies the UI.
 *
 *   idle ──(pick destination)──▶ preview ──(GO)──▶ navigating ──(STOP)──▶ idle
 *                                   └──────────(X)──────────────────────────┘
 */
import type { Point } from '../services/geo-math';
import type { Fix } from '../services/geolocation';
import type { Route } from '../services/routing';
import { initialAnnounce, updateAnnounce, type AnnounceState } from './announce';
import { initialOffRoute, updateOffRoute, type OffRouteState } from './off-route';
import { computeProgress, type Progress } from './progress';
import { cumulativeMeters, snapToRoute, type Snapped } from './snap';

export type NavPhase = 'idle' | 'preview' | 'navigating';

export interface NavUpdate {
  progress: Progress;
  snapped: Snapped;
  offRoute: boolean;
  /** A reroute is in flight. */
  rerouting: boolean;
}

/** Where you're going: needs the position, not just the name, to reroute. */
export interface Destination extends Point {
  label: string;
}

/** Meters to the destination below which you're considered to have arrived. */
const ARRIVAL_M = 40;

/**
 * Minimum time between reroutes.
 *
 * Without this brake, a persistent deviation (a street mapped wrong, a
 * deliberate shortcut) would request a new route on every GPS reading:
 * several per second against the API, and the card flickering nonstop.
 */
const MIN_REROUTE_MS = 15_000;

export class NavSession {
  private _phase: NavPhase = 'idle';
  private _route: Route | null = null;
  private cumulative: number[] = [];
  private lastIndex = 0;
  private off: OffRouteState = initialOffRoute;
  private announce: AnnounceState = initialAnnounce;
  private _destination: Destination | null = null;
  private _rerouting = false;
  /**
   * -Infinity, not 0: zero is a LEGITIMATE timestamp (the one performance.now()
   * returns right after startup), so using it as a "never" sentinel defeated
   * the brake between reroutes. A test with a fake clock caught this.
   */
  private lastRerouteAt = -Infinity;

  onPhase: ((phase: NavPhase) => void) | null = null;
  onUpdate: ((update: NavUpdate) => void) | null = null;
  onArrived: (() => void) | null = null;
  /** Time to say `text` out loud. Whoever listens decides how (VoiceGuide). */
  onAnnounce: ((text: string) => void) | null = null;

  /**
   * A new route is needed from `from`. Whoever listens makes the request and
   * responds with `replaceRoute()` or `rerouteFailed()`.
   *
   * The session deliberately doesn't talk to the network: that way it
   * doesn't depend on HTTP and the whole state machine can be tested with
   * synthetic readings, which is the only way to verify this without driving.
   */
  onNeedsReroute: ((from: Fix, to: Destination) => void) | null = null;

  get destination(): Destination | null {
    return this._destination;
  }

  get rerouting(): boolean {
    return this._rerouting;
  }

  get phase(): NavPhase {
    return this._phase;
  }

  get route(): Route | null {
    return this._route;
  }

  /** Route calculated: moves to preview, without starting to navigate. */
  preview(route: Route, destination: Destination) {
    this._destination = destination;
    this.adopt(route);
    this.setPhase('preview');
  }

  /**
   * New route after a deviation. Doesn't change phase: you're still
   * navigating, just via a different path.
   */
  replaceRoute(route: Route) {
    if (this._phase !== 'navigating') return;
    this._rerouting = false;
    this.adopt(route);
  }

  /** The reroute didn't work out. It will be retried after the minimum interval. */
  rerouteFailed() {
    this._rerouting = false;
  }

  /** State derived from a route, whether it's brand new or a replacement. */
  private adopt(route: Route) {
    this._route = route;
    // Computed once per route, not on every GPS reading.
    this.cumulative = cumulativeMeters(route.coordinates);
    this.lastIndex = 0;
    this.off = initialOffRoute;
    this.announce = initialAnnounce;
  }

  /** The user has pressed GO. */
  start() {
    if (!this._route) return;
    this.setPhase('navigating');
  }

  /** STOP, the X, or having arrived. */
  stop() {
    this._route = null;
    this.cumulative = [];
    this._destination = null;
    this.lastIndex = 0;
    this.off = initialOffRoute;
    this.announce = initialAnnounce;
    this._rerouting = false;
    this.lastRerouteAt = -Infinity;
    this.setPhase('idle');
  }

  /**
   * A new GPS reading. Only does something while navigating: in preview the
   * route doesn't change just because you moved a little.
   */
  consume(fix: Fix) {
    if (this._phase !== 'navigating' || !this._route) return;

    const snapped = snapToRoute(fix, this._route.coordinates, this.cumulative, this.lastIndex);
    this.lastIndex = snapped.index;

    this.off = updateOffRoute(this.off, snapped.distanceM, fix.accuracy);
    const progress = computeProgress(snapped, this._route, this.cumulative);

    if (this.off.off) {
      this.maybeReroute(fix);
    } else {
      // Only announce while confirmed on-route: off it, the "next" maneuver
      // no longer means anything, and announcing it would confuse more than
      // silence would.
      const { state, toSpeak } = updateAnnounce(this.announce, progress);
      this.announce = state;
      if (toSpeak) this.onAnnounce?.(toSpeak);
    }

    this.onUpdate?.({
      progress,
      snapped,
      offRoute: this.off.off,
      rerouting: this._rerouting,
    });

    // Arriving only counts if you're really on the route: off it, the
    // remaining distance doesn't mean anything.
    if (!this.off.off && progress.remainingM < ARRIVAL_M) {
      // Stop first: `stop()` moves to the idle phase, which clears the UI.
      // Notifying before that would erase the arrival message itself.
      this.stop();
      this.onArrived?.();
    }
  }

  /** Requests a new route if it's time: off route, none other in flight, and not too soon. */
  private maybeReroute(fix: Fix) {
    if (this._rerouting || !this._destination || !this.onNeedsReroute) return;

    const now = performance.now();
    if (now - this.lastRerouteAt < MIN_REROUTE_MS) return;

    this.lastRerouteAt = now;
    this._rerouting = true;
    this.onNeedsReroute(fix, this._destination);
  }

  private setPhase(phase: NavPhase) {
    if (this._phase === phase) return;
    this._phase = phase;
    this.onPhase?.(phase);
  }
}
