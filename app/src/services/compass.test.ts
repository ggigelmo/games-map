import { describe, expect, it } from 'vitest';

import { angleDelta } from './compass';

describe('angleDelta', () => {
  it('is 0 for the same heading', () => {
    // The compass deadband depends on this: if this doesn't come out as 0,
    // it stops filtering magnetometer noise and the map jitters while
    // stationary.
    expect(angleDelta(0, 0)).toBe(0);
    expect(angleDelta(180, 180)).toBe(0);
  });

  it('wraps around north via the short path', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(20);
  });

  it('is symmetric and never exceeds 180', () => {
    for (const [a, b] of [[0, 90], [90, 0], [0, 179], [0, 181], [45, 300]]) {
      expect(angleDelta(a!, b!)).toBe(angleDelta(b!, a!));
      expect(angleDelta(a!, b!)).toBeLessThanOrEqual(180);
    }
  });

  it('is 180 for opposite headings', () => {
    expect(angleDelta(0, 180)).toBe(180);
    expect(angleDelta(270, 90)).toBe(180);
  });
});
