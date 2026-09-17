/**
 * Off-route detection. In phase 3a it only detects, so the card can say OFF
 * ROUTE instead of continuing to give directions for a route you're no longer
 * following. Automatic recalculation arrives in 3b.
 *
 * Pure reducer: takes the previous state and a reading, returns the new state.
 */

/** Never goes below this, no matter how precise the GPS claims to be. */
const FLOOR_M = 35;

/** How many consecutive out-of-range readings are needed to declare it. */
const STREAK_TO_DECLARE = 3;

export interface OffRouteState {
  /** Consecutive readings above the threshold. */
  streak: number;
  off: boolean;
}

export const initialOffRoute: OffRouteState = { streak: 0, off: false };

/**
 * Threshold tied to the accuracy of EACH reading, not fixed.
 *
 * With a fixed 30 m threshold, a +-50 m fix on a narrow street triggers it
 * constantly and the app spends the whole trip thinking you've gone off
 * route. GPS accuracy has to be part of the calculation.
 */
export function offRouteThreshold(accuracyM: number): number {
  return Math.max(FLOOR_M, accuracyM * 2.5);
}

export function updateOffRoute(
  state: OffRouteState,
  distanceM: number,
  accuracyM: number,
): OffRouteState {
  const outOfRange = distanceM > offRouteThreshold(accuracyM);

  if (!outOfRange) {
    // A single good reading is enough to return: if you're on the route,
    // you're on the route. The hysteresis is only for DECLARING off-route.
    return initialOffRoute;
  }

  const streak = state.streak + 1;
  return { streak, off: state.off || streak >= STREAK_TO_DECLARE };
}
