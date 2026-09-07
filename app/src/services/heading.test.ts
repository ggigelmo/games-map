import { describe, expect, it } from 'vitest';

import {
  compassWins,
  gpsHeadingUsable,
  GPS_HEADING_MIN_SPEED,
  GPS_HEADING_TTL_MS,
} from './heading';

describe('gpsHeadingUsable', () => {
  it('rechaza el rumbo cuando estas parado', () => {
    // Es el caso que motiva la brujula: parado, coords.heading llega a null o
    // con un valor cualquiera, y el mapa se quedaba clavado al norte.
    expect(gpsHeadingUsable(null, 0)).toBe(false);
    expect(gpsHeadingUsable(90, 0)).toBe(false);
    expect(gpsHeadingUsable(90, null)).toBe(false);
  });

  it('rechaza el rumbo andando despacio', () => {
    expect(gpsHeadingUsable(90, 1.0)).toBe(false);
  });

  it('lo acepta en marcha', () => {
    expect(gpsHeadingUsable(90, GPS_HEADING_MIN_SPEED)).toBe(true);
    expect(gpsHeadingUsable(200, 12)).toBe(true);
  });

  it('rechaza un rumbo NaN aunque vayas rapido', () => {
    expect(gpsHeadingUsable(Number.NaN, 20)).toBe(false);
  });
});

describe('compassWins', () => {
  it('cede el mando al GPS mientras dura su prioridad', () => {
    const ahora = 10_000;
    expect(compassWins(ahora, ahora + GPS_HEADING_TTL_MS)).toBe(false);
  });

  it('recupera el mando cuando el GPS caduca', () => {
    const ahora = 10_000;
    expect(compassWins(ahora, ahora - 1)).toBe(true);
  });

  it('manda desde el principio si el GPS nunca dio rumbo', () => {
    expect(compassWins(performance.now(), 0)).toBe(true);
  });
});
