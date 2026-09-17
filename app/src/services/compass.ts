/**
 * Device compass.
 *
 * It exists because GPS only knows your heading when you're MOVING: stopped
 * or walking slowly, `coords.heading` comes back null and the map is left
 * facing north. The compass tells you which way you're pointing even while
 * standing still.
 *
 * While moving, the GPS is in charge, not this: with the phone in a mount,
 * the device's orientation doesn't necessarily match the car's direction.
 * MapView is the one that decides which to use.
 */

/** Degrees of change below which the reading is ignored. */
const DEADBAND_DEG = 2;

/** The compass fires dozens of times per second; this is more than enough. */
const THROTTLE_MS = 100;

type PermissionResult = 'granted' | 'denied' | 'unsupported';

interface IOSDeviceOrientationEvent extends DeviceOrientationEvent {
  /** iOS only: heading relative to north, clockwise. Already comes ready to use. */
  webkitCompassHeading?: number;
}

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState | 'granted' | 'denied'>;
};

export class Compass {
  private subs = new Set<(heading: number) => void>();
  private listening = false;
  private lastEmit = 0;

  /** Last known heading in degrees (0 = north), or null. */
  heading: number | null = null;

  /** Whether the browser even exposes the event. */
  readonly supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;

  /**
   * iOS requires explicitly requesting permission, and only from a user
   * gesture. On Android and desktop the event arrives without asking for
   * anything.
   */
  readonly needsPermission =
    this.supported && typeof (window.DeviceOrientationEvent as OrientationCtor).requestPermission === 'function';

  onHeading(cb: (heading: number) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  /**
   * Requests permission and starts. MUST be called from a click handler or
   * iOS rejects it without even asking.
   */
  async enable(): Promise<PermissionResult> {
    if (!this.supported) return 'unsupported';

    if (this.needsPermission) {
      const ctor = window.DeviceOrientationEvent as OrientationCtor;
      try {
        const answer = await ctor.requestPermission!();
        if (answer !== 'granted') return 'denied';
      } catch {
        // Throws if it doesn't come from a user gesture.
        return 'denied';
      }
    }

    this.listen();
    return 'granted';
  }

  private listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('deviceorientation', this.onEvent, true);
  }

  stop() {
    window.removeEventListener('deviceorientation', this.onEvent, true);
    this.listening = false;
  }

  private onEvent = (raw: Event) => {
    const e = raw as IOSDeviceOrientationEvent;

    let deg: number | null = null;
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      // iOS already gives it as a compass heading.
      deg = e.webkitCompassHeading;
    } else if (e.absolute && e.alpha !== null) {
      // The standard measures alpha COUNTERclockwise from north, so it has
      // to be flipped to get a compass heading.
      deg = (360 - e.alpha) % 360;
    }
    if (deg === null || Number.isNaN(deg)) return;

    // Deadband: without this, magnetometer noise makes the map jitter even
    // with the phone sitting still on a table.
    if (this.heading !== null && angleDelta(this.heading, deg) < DEADBAND_DEG) return;

    const now = performance.now();
    if (now - this.lastEmit < THROTTLE_MS) return;
    this.lastEmit = now;

    this.heading = deg;
    for (const cb of this.subs) cb(deg);
  };
}

/**
 * Shortest angular difference between two headings, in degrees (0..180).
 *
 * The important part is that it correctly wraps around north: from 350 to 10
 * is 20 degrees, not 340. The double modulo is so it also works with negative
 * differences, which JavaScript's `%` doesn't normalize.
 */
export function angleDelta(a: number, b: number): number {
  const d = ((((b - a) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}
