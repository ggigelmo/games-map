import { describe, expect, it } from 'vitest';

import {
  compassWins,
  gpsHeadingUsable,
  GPS_HEADING_MIN_SPEED,
  GPS_HEADING_TTL_MS,
} from './heading';

describe('gpsHeadingUsable', () => {
  it('rejects the heading when stopped', () => {
    // This is the case that motivates the compass: stopped, coords.heading
    // comes in as null or some arbitrary value, and the map used to stay
    // stuck pointing north.
    expect(gpsHeadingUsable(null, 0)).toBe(false);
    expect(gpsHeadingUsable(90, 0)).toBe(false);
    expect(gpsHeadingUsable(90, null)).toBe(false);
  });

  it('rejects the heading when walking slowly', () => {
    expect(gpsHeadingUsable(90, 1.0)).toBe(false);
  });

  it('accepts it while moving', () => {
    expect(gpsHeadingUsable(90, GPS_HEADING_MIN_SPEED)).toBe(true);
    expect(gpsHeadingUsable(200, 12)).toBe(true);
  });

  it('rejects a NaN heading even when moving fast', () => {
    expect(gpsHeadingUsable(Number.NaN, 20)).toBe(false);
  });
});

describe('compassWins', () => {
  it('yields control to the GPS while its priority lasts', () => {
    const now = 10_000;
    expect(compassWins(now, now + GPS_HEADING_TTL_MS)).toBe(false);
  });

  it('regains control when the GPS expires', () => {
    const now = 10_000;
    expect(compassWins(now, now - 1)).toBe(true);
  });

  it('has control from the start if the GPS never gave a heading', () => {
    expect(compassWins(performance.now(), 0)).toBe(true);
  });
});
