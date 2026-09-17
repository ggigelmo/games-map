import { describe, expect, it } from 'vitest';

import type { Maneuver } from '../services/routing';
import { initialAnnounce, updateAnnounce } from './announce';
import type { Progress } from './progress';

/** Synthetic maneuver: only the fields announce.ts uses are needed. */
function maneuver(over: Partial<Maneuver> = {}): Maneuver {
  return {
    instruction: 'turn right',
    type: 10,
    streetNames: ['Main Street'],
    verbal: 'Turn right onto Main Street.',
    verbalAlert: 'In 400 meters, turn right.',
    multiCue: false,
    beginIndex: 10,
    lengthKm: 0.2,
    timeS: 30,
    ...over,
  };
}

/** Synthetic progress at `distanceToNextM` from `next`. */
function progressAt(distanceToNextM: number, next: Maneuver | null): Progress {
  return { next, distanceToNextM, remainingM: distanceToNextM + 500, remainingS: 60 };
}

describe('updateAnnounce', () => {
  it('says nothing with no maneuver ahead', () => {
    const r = updateAnnounce(initialAnnounce, progressAt(0, null));
    expect(r.toSpeak).toBeNull();
  });

  it('says nothing far from both thresholds', () => {
    const m = maneuver();
    const r = updateAnnounce(initialAnnounce, progressAt(1000, m));
    expect(r.toSpeak).toBeNull();
  });

  it('alerts once on crossing the early threshold, and not again', () => {
    const m = maneuver();
    const first = updateAnnounce(initialAnnounce, progressAt(400, m));
    expect(first.toSpeak).toBe(m.verbalAlert);

    // Continuing to approach without crossing the second threshold doesn't repeat the alert.
    const second = updateAnnounce(first.state, progressAt(200, m));
    expect(second.toSpeak).toBeNull();
  });

  it('alerts right before on crossing the short threshold, after the early one', () => {
    let state = initialAnnounce;
    const m = maneuver();

    ({ state } = updateAnnounce(state, progressAt(400, m)));
    const justBefore = updateAnnounce(state, progressAt(60, m));
    expect(justBefore.toSpeak).toBe(m.verbal);
  });

  it('if the maneuver already appears close, alerts early and just-before separately', () => {
    // Sparse trace (or very tight turns): the reading jumps straight to <60 m
    // without first passing through the 400 threshold. The early alert must
    // not be lost.
    const m = maneuver();
    const first = updateAnnounce(initialAnnounce, progressAt(50, m));
    expect(first.toSpeak).toBe(m.verbalAlert);

    const second = updateAnnounce(first.state, progressAt(50, m));
    expect(second.toSpeak).toBe(m.verbal);
  });

  it('resets what was said when moving to the next maneuver', () => {
    const m1 = maneuver({ beginIndex: 10 });
    const m2 = maneuver({ beginIndex: 20, verbal: 'Turn left.', verbalAlert: 'In 400 meters, left.' });

    let state = initialAnnounce;
    ({ state } = updateAnnounce(state, progressAt(400, m1)));
    ({ state } = updateAnnounce(state, progressAt(60, m1)));

    const forM2 = updateAnnounce(state, progressAt(400, m2));
    expect(forM2.toSpeak).toBe(m2.verbalAlert);
  });

  it('with multiCue, skips the chained maneuver\'s early alert', () => {
    const m1 = maneuver({ beginIndex: 10, multiCue: true });
    const m2 = maneuver({ beginIndex: 20, verbal: 'Turn left.', verbalAlert: 'In 400 meters, left.' });

    let state = initialAnnounce;
    // m1 is announced in full (its verbal already includes m2's chained turn).
    ({ state } = updateAnnounce(state, progressAt(400, m1)));
    ({ state } = updateAnnounce(state, progressAt(60, m1)));

    // m2's early alert is skipped: it was already said inside m1's.
    const alertM2 = updateAnnounce(state, progressAt(400, m2));
    expect(alertM2.toSpeak).toBeNull();

    // But m2's just-before alert is still said: it's the only cue for WHEN.
    const preM2 = updateAnnounce(alertM2.state, progressAt(60, m2));
    expect(preM2.toSpeak).toBe(m2.verbal);
  });

  it('with no Valhalla text for that alert, says nothing but does not get stuck', () => {
    const m = maneuver({ verbal: undefined, verbalAlert: undefined });
    const state = initialAnnounce;

    const alert = updateAnnounce(state, progressAt(400, m));
    expect(alert.toSpeak).toBeNull();

    const pre = updateAnnounce(alert.state, progressAt(60, m));
    expect(pre.toSpeak).toBeNull();
  });
});
