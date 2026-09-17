/**
 * Sole owner of `watchPosition`. Distributes readings to whoever needs them.
 *
 * The owner used to be the diagnostics panel (`diag/probe.ts`), which was the
 * pragmatic choice back when only the HUD consumed the position. With routing
 * entering the picture there would be two subscribers hanging off a debug
 * panel, so this was extracted here.
 *
 * It does exactly ONE thing: keep the GPS subscription alive and broadcast
 * what comes in. Statistics (average accuracy, intervals) are computed by the
 * diagnostics panel from this stream; they are not this module's concern.
 */

export interface Fix {
  lng: number;
  lat: number;
  /** degrees, or null if the GPS doesn't know (stationary) */
  heading: number | null;
  /** m/s, or null */
  speed: number | null;
  accuracy: number;
  /** `performance.now()` of when it arrived, to measure intervals */
  at: number;
}

export type GeoFailure =
  | { kind: 'unsupported' }
  /**
   * The permission prompt never responded. Installed PWAs on iOS have a
   * long-standing bug where the dialog never appears and the call doesn't
   * time out either, so a timer of our own is needed: the API's never fires.
   */
  | { kind: 'silent' }
  | { kind: 'error'; code: number; message: string };

/** How long to wait before treating the permission as unanswered. */
const SILENCE_MS = 12_000;

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

export class GeoWatcher {
  private fixSubs = new Set<(fix: Fix) => void>();
  private failSubs = new Set<(failure: GeoFailure) => void>();
  private watchId: number | null = null;
  private silenceTimer: number | null = null;
  private answered = false;

  /** Last known reading, or null if none has arrived yet. */
  last: Fix | null = null;

  /** Moment `start()` was called, to measure the first fix. */
  readonly startedAt = performance.now();

  /** @returns function to unsubscribe */
  onFix(cb: (fix: Fix) => void): () => void {
    this.fixSubs.add(cb);
    // A late subscriber gets the last reading instead of waiting for the
    // next one, which can take seconds with GPS.
    if (this.last) cb(this.last);
    return () => this.fixSubs.delete(cb);
  }

  /** @returns function to unsubscribe */
  onFailure(cb: (failure: GeoFailure) => void): () => void {
    this.failSubs.add(cb);
    return () => this.failSubs.delete(cb);
  }

  start() {
    if (this.watchId !== null) return;

    if (!('geolocation' in navigator)) {
      this.fail({ kind: 'unsupported' });
      return;
    }

    this.silenceTimer = window.setTimeout(() => {
      if (!this.answered) this.fail({ kind: 'silent' });
    }, SILENCE_MS);

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.settle();
        const fix: Fix = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          accuracy: pos.coords.accuracy,
          at: performance.now(),
        };
        this.last = fix;
        for (const cb of this.fixSubs) cb(fix);
      },
      (err) => {
        this.settle();
        const messages: Record<number, string> = {
          1: 'PERMISSION DENIED',
          2: 'POSITION UNAVAILABLE',
          3: 'TIMEOUT',
        };
        this.fail({
          kind: 'error',
          code: err.code,
          message: messages[err.code] ?? `ERROR ${err.code}`,
        });
      },
      OPTIONS,
    );
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.settle();
  }

  private settle() {
    this.answered = true;
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private fail(failure: GeoFailure) {
    this.settle();
    for (const cb of this.failSubs) cb(failure);
  }
}
