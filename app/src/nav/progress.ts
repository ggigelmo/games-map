/**
 * Which turn is next and how far it is. Pure logic over the result of
 * snapToRoute.
 */
import type { Maneuver, Route } from '../services/routing';
import type { Snapped } from './snap';

export interface Progress {
  /** The maneuver ahead of you, or null if none remain. */
  next: Maneuver | null;
  /** Meters until that maneuver. */
  distanceToNextM: number;
  /** Meters remaining in the trip. */
  remainingM: number;
  /** Seconds remaining in the trip. */
  remainingS: number;
}

/**
 * Valhalla's `begin_shape_index` marks WHERE the maneuver occurs. Between
 * maneuver i and i+1, the turn that needs to be announced is i+1: maneuver i
 * is the one you already executed (or the initial "head out and continue on
 * such street").
 */
export function computeProgress(
  snapped: Snapped,
  route: Route,
  cumulative: number[],
): Progress {
  const totalM = cumulative[cumulative.length - 1] ?? 0;
  const remainingM = Math.max(0, totalM - snapped.alongM);

  const next = route.maneuvers.find((m) => m.beginIndex > snapped.index) ?? null;

  const distanceToNextM = next
    ? Math.max(0, (cumulative[next.beginIndex] ?? totalM) - snapped.alongM)
    : remainingM;

  return { next, distanceToNextM, remainingM, remainingS: remainingSeconds(snapped, route) };
}

/**
 * Remaining time by summing the time of the maneuvers left.
 *
 * Prorating over the total distance would be simpler but would lie as soon as
 * the trip mixes city and highway: the same meters don't cost the same. Here
 * the time of each pending maneuver is summed, and only the segment you're
 * currently on gets prorated.
 */
function remainingSeconds(snapped: Snapped, route: Route): number {
  const ms = route.maneuvers;
  let total = 0;
  let current: Maneuver | null = null;

  for (const m of ms) {
    if (m.beginIndex > snapped.index) total += m.timeS;
    else current = m;
  }

  if (current) {
    // Fraction of the current segment remaining to be traveled, in vertices.
    const upcoming = ms.find((m) => m.beginIndex > snapped.index);
    const endIndex = upcoming ? upcoming.beginIndex : snapped.index + 1;
    const segmentLength = Math.max(1, endIndex - current.beginIndex);
    const traveled = Math.max(0, Math.min(segmentLength, snapped.index - current.beginIndex));
    total += current.timeS * (1 - traveled / segmentLength);
  }

  return Math.max(0, total);
}
