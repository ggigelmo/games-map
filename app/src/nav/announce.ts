/**
 * When to announce a maneuver by voice. Pure logic: the previous state and
 * current progress go in, the new state and, if it's time, the text to say
 * come out.
 *
 * Two announcements per maneuver, like any navigation app: an early one and
 * one right as you arrive. The distance thresholds are eyeballed, like the
 * rest of the project's constants (see docs/status.md): they'll need
 * tuning with a real GPS.
 */
import type { Maneuver } from '../services/routing';
import type { Progress } from './progress';

export interface AnnounceState {
  /** beginIndex of the maneuver something has already been said for. */
  maneuverIndex: number | null;
  alerted: boolean;
  preSpoken: boolean;
  /**
   * The previous maneuver chained into this one with `multiCue`, so its
   * early alert was already said inside the previous instruction.
   */
  skipAlert: boolean;
}

export const initialAnnounce: AnnounceState = {
  maneuverIndex: null,
  alerted: false,
  preSpoken: false,
  skipAlert: false,
};

/** Early alert, at this distance from the maneuver. */
const ALERT_M = 400;

/** Alert right before, at this distance. */
const PRE_M = 60;

export function updateAnnounce(
  state: AnnounceState,
  progress: Progress,
): { state: AnnounceState; toSpeak: string | null } {
  const next: Maneuver | null = progress.next;
  if (!next) return { state, toSpeak: null };

  // New maneuver: what's been said resets, except for `skipAlert`, which
  // depends on how the PREVIOUS maneuver ended and is decided below.
  const s: AnnounceState =
    state.maneuverIndex === next.beginIndex
      ? state
      : { maneuverIndex: next.beginIndex, alerted: false, preSpoken: false, skipAlert: state.skipAlert };

  if (!s.alerted && progress.distanceToNextM <= ALERT_M) {
    const toSpeak = !s.skipAlert && next.verbalAlert ? next.verbalAlert : null;
    return { state: { ...s, alerted: true }, toSpeak };
  }

  if (!s.preSpoken && progress.distanceToNextM <= PRE_M) {
    const updated = { ...s, preSpoken: true, skipAlert: next.multiCue };
    return { state: updated, toSpeak: next.verbal ?? null };
  }

  return { state: s, toSpeak: null };
}
