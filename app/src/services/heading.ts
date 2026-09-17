/**
 * Where the map's heading comes from: GPS or the compass.
 *
 * Lives apart from MapView, and is pure logic, because it is the rule that
 * actually decides the behavior and there is no way to verify it in a desktop
 * browser: it would require moving and turning a phone. Here it actually can
 * be tested.
 */

/**
 * Speed (m/s) below which the GPS heading is noise. ~5.4 km/h.
 *
 * GPS doesn't know where you're LOOKING, only where you've moved. Stopped or
 * walking slowly, that vector swings wildly by 180 degrees.
 */
export const GPS_HEADING_MIN_SPEED = 1.5;

/**
 * How long the GPS keeps priority after the last reading taken while moving.
 *
 * Without this inertia, every traffic light would hand control back to the
 * compass and the map would rotate according to how you hold the phone
 * instead of the direction of the car.
 */
export const GPS_HEADING_TTL_MS = 6_000;

/** Is this GPS reading's heading reliable? */
export function gpsHeadingUsable(heading: number | null, speed: number | null): boolean {
  return heading !== null && !Number.isNaN(heading) && (speed ?? 0) >= GPS_HEADING_MIN_SPEED;
}

/** Does the compass have control right now, or does the GPS still hold priority? */
export function compassWins(now: number, gpsHeadingUntil: number): boolean {
  return now >= gpsHeadingUntil;
}
