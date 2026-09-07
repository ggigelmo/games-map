import { describe, expect, it } from 'vitest';

import { angleDelta } from './compass';

describe('angleDelta', () => {
  it('vale 0 para el mismo rumbo', () => {
    // La banda muerta de la brujula depende de esto: si aqui no sale 0, deja
    // de filtrar el ruido del magnetometro y el mapa vibra estando quieto.
    expect(angleDelta(0, 0)).toBe(0);
    expect(angleDelta(180, 180)).toBe(0);
  });

  it('cruza el norte por el camino corto', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(20);
  });

  it('es simetrica y nunca pasa de 180', () => {
    for (const [a, b] of [[0, 90], [90, 0], [0, 179], [0, 181], [45, 300]]) {
      expect(angleDelta(a!, b!)).toBe(angleDelta(b!, a!));
      expect(angleDelta(a!, b!)).toBeLessThanOrEqual(180);
    }
  });

  it('da 180 en rumbos opuestos', () => {
    expect(angleDelta(0, 180)).toBe(180);
    expect(angleDelta(270, 90)).toBe(180);
  });
});
