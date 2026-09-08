import { describe, expect, it } from 'vitest';

import { distanceMeters, type Point } from '../services/geo-math';
import { decodePolyline, type Maneuver, type Route } from '../services/routing';
import { MADRID_SHAPE } from '../services/routing.fixture';
import { computeProgress } from './progress';
import { initialOffRoute, offRouteThreshold, updateOffRoute } from './off-route';
import { cumulativeMeters, snapToRoute } from './snap';

const COORDS = decodePolyline(MADRID_SHAPE);
const CUM = cumulativeMeters(COORDS);
const TOTAL_M = CUM[CUM.length - 1]!;

// ------------------------------------------------------------- utilidades
//
// Nada de esto se puede probar conduciendo desde un test, asi que se fabrica
// una traza GPS recorriendo la propia polilinea real.

/** Punto de la ruta a `meters` del inicio. */
function pointAt(meters: number): Point {
  const m = Math.max(0, Math.min(TOTAL_M, meters));
  let i = 0;
  while (i < CUM.length - 2 && CUM[i + 1]! < m) i++;
  const seg = CUM[i + 1]! - CUM[i]!;
  const t = seg === 0 ? 0 : (m - CUM[i]!) / seg;
  const a = COORDS[i]!;
  const b = COORDS[i + 1]!;
  return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t };
}

/** Generador determinista, para que un test que falla vuelva a fallar igual. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Traza recorriendo la ruta a pasos de `stepM`, con ruido opcional en metros. */
function walk(stepM: number, noiseM = 0, seed = 7): Point[] {
  const rand = rng(seed);
  const out: Point[] = [];
  for (let m = 0; m <= TOTAL_M; m += stepM) {
    const p = pointAt(m);
    if (noiseM === 0) {
      out.push(p);
    } else {
      // Desplazamiento aleatorio en grados equivalente a +-noiseM metros.
      const dLat = ((rand() - 0.5) * 2 * noiseM) / 110_540;
      const dLng =
        ((rand() - 0.5) * 2 * noiseM) / (111_320 * Math.cos((p.lat * Math.PI) / 180));
      out.push({ lng: p.lng + dLng, lat: p.lat + dLat });
    }
  }
  return out;
}

/**
 * Maniobras sinteticas en indices conocidos. Se prefieren a las reales porque
 * asi los valores esperados se calculan a mano y el test comprueba la logica,
 * no los datos de OpenStreetMap.
 */
// Derivados de la longitud real (218 vertices en esta ruta): con indices
// clavados a mano, dos se salian del array y quedaban desordenados, y `find`
// devolvia una maniobra inexistente.
const N = COORDS.length;
const MANEUVER_INDICES = [
  0,
  Math.floor(N * 0.15),
  Math.floor(N * 0.35),
  Math.floor(N * 0.6),
  Math.floor(N * 0.85),
  N - 1,
];

const ROUTE: Route = {
  coordinates: COORDS,
  distanceKm: TOTAL_M / 1000,
  durationS: 600,
  bounds: [
    [0, 0],
    [0, 0],
  ],
  maneuvers: MANEUVER_INDICES.map(
    (beginIndex, i): Maneuver => ({
      instruction: `maniobra ${i}`,
      type: i === 0 ? 1 : 15,
      streetNames: [`Calle ${i}`],
      verbal: undefined,
      verbalAlert: undefined,
      beginIndex,
      lengthKm: 0.1,
      timeS: 100,
    }),
  ),
};

// ------------------------------------------------------------------ tests

describe('snapToRoute recorriendo la ruta', () => {
  it('se pega a la ruta y avanza sin retroceder', () => {
    const traza = walk(25);
    let index = 0;
    let alongAnterior = -1;

    for (const pos of traza) {
      const s = snapToRoute(pos, COORDS, CUM, index);

      // La traza va POR la ruta, asi que la distancia perpendicular es ~0.
      expect(s.distanceM).toBeLessThan(1);
      // El indice nunca debe ir hacia atras en un recorrido limpio.
      expect(s.index).toBeGreaterThanOrEqual(index);
      expect(s.alongM).toBeGreaterThan(alongAnterior);

      index = s.index;
      alongAnterior = s.alongM;
    }

    // Y se llega al final: el ultimo punto esta al final de la ruta.
    expect(alongAnterior).toBeGreaterThan(TOTAL_M - 30);
  });

  it('encuentra la posicion aunque se le de un indice muy equivocado', () => {
    // Caso real: reabres la app tras conducir un rato. La ventana de busqueda
    // no contiene tu posicion y tiene que entrar la valvula de escape.
    const pos = pointAt(TOTAL_M * 0.8);
    const s = snapToRoute(pos, COORDS, CUM, 0);
    expect(s.distanceM).toBeLessThan(5);
    expect(s.alongM).toBeGreaterThan(TOTAL_M * 0.75);
  });
});

describe('computeProgress', () => {
  it('anuncia la maniobra siguiente, no la que ya pasaste', () => {
    const m1 = MANEUVER_INDICES[1]!;
    const m2 = MANEUVER_INDICES[2]!;
    // Un poco despues de la maniobra 1: la que toca anunciar es la 2.
    const s = snapToRoute(pointAt(CUM[m1 + 3]!), COORDS, CUM, m1);
    const p = computeProgress(s, ROUTE, CUM);
    expect(p.next?.beginIndex).toBe(m2);
  });

  it('mide la distancia hasta el giro', () => {
    const desde = MANEUVER_INDICES[1]! + 5;
    const hasta = MANEUVER_INDICES[2]!;
    const s = snapToRoute(pointAt(CUM[desde]!), COORDS, CUM, desde);
    const p = computeProgress(s, ROUTE, CUM);
    expect(p.distanceToNextM).toBeCloseTo(CUM[hasta]! - CUM[desde]!, 0);
  });

  it('descuenta lo que queda de viaje', () => {
    const mitad = TOTAL_M / 2;
    const s = snapToRoute(pointAt(mitad), COORDS, CUM, 0);
    const p = computeProgress(s, ROUTE, CUM);
    expect(p.remainingM).toBeCloseTo(TOTAL_M - mitad, 0);
    // El tiempo restante baja, pero no de golpe a cero.
    expect(p.remainingS).toBeGreaterThan(0);
    expect(p.remainingS).toBeLessThan(ROUTE.durationS);
  });

  it('al llegar, la maniobra pendiente es la de destino', () => {
    // No devuelve null: la maniobra de llegada sigue estando DELANTE de ti
    // mientras no pases el ultimo vertice, y es lo que hay que ensenar.
    const s = snapToRoute(pointAt(TOTAL_M), COORDS, CUM, N - 3);
    const p = computeProgress(s, ROUTE, CUM);
    expect(p.next?.beginIndex).toBe(N - 1);
    expect(p.remainingM).toBeLessThan(5);
  });

  it('devuelve null cuando ya no queda ninguna maniobra por delante', () => {
    // Ruta cuya ultima maniobra esta a mitad: pasado ese punto no hay nada que
    // anunciar, y la tarjeta tiene que saber tratarlo.
    const corta: Route = { ...ROUTE, maneuvers: ROUTE.maneuvers.slice(0, 3) };
    const s = snapToRoute(pointAt(TOTAL_M), COORDS, CUM, N - 3);
    const p = computeProgress(s, corta, CUM);
    expect(p.next).toBeNull();
    expect(p.distanceToNextM).toBeCloseTo(p.remainingM, 0);
  });
});

describe('deteccion de desvio', () => {
  it('ata el umbral a la precision del GPS', () => {
    // Es la razon de existir de offRouteThreshold: con un umbral fijo de 30 m,
    // un fix de +-50 m dispara el desvio sin que te hayas movido de la calle.
    expect(offRouteThreshold(5)).toBe(35);
    expect(offRouteThreshold(60)).toBe(150);
  });

  it('no declara desvio en un recorrido limpio', () => {
    let estado = initialOffRoute;
    let index = 0;
    for (const pos of walk(25)) {
      const s = snapToRoute(pos, COORDS, CUM, index);
      index = s.index;
      estado = updateOffRoute(estado, s.distanceM, 10);
      expect(estado.off).toBe(false);
    }
  });

  it('NO declara desvio con ruido de tunel de +-60 m', () => {
    // El falso positivo que arruina estas apps: en un canon urbano el GPS se
    // va decenas de metros y una app ingenua recalcula sin parar.
    let estado = initialOffRoute;
    let index = 0;
    for (const pos of walk(25, 60, 42)) {
      const s = snapToRoute(pos, COORDS, CUM, index);
      index = s.index;
      // Se reporta la precision real: eso es lo que sube el umbral.
      estado = updateOffRoute(estado, s.distanceM, 60);
    }
    expect(estado.off).toBe(false);
  });

  it('declara desvio tras tres lecturas fuera, y no antes', () => {
    const desviado = 200; // metros perpendiculares
    let estado = initialOffRoute;

    estado = updateOffRoute(estado, desviado, 10);
    expect(estado.off).toBe(false);
    estado = updateOffRoute(estado, desviado, 10);
    expect(estado.off).toBe(false);
    estado = updateOffRoute(estado, desviado, 10);
    expect(estado.off).toBe(true);
  });

  it('una sola lectura mala no cuenta', () => {
    let estado = initialOffRoute;
    estado = updateOffRoute(estado, 200, 10);
    estado = updateOffRoute(estado, 200, 10);
    // Vuelve a la ruta antes de la tercera: se olvida.
    estado = updateOffRoute(estado, 5, 10);
    expect(estado).toEqual(initialOffRoute);
  });

  it('se recupera al volver a la ruta', () => {
    let estado = initialOffRoute;
    for (let i = 0; i < 5; i++) estado = updateOffRoute(estado, 300, 10);
    expect(estado.off).toBe(true);
    estado = updateOffRoute(estado, 8, 10);
    expect(estado.off).toBe(false);
  });
});

describe('coherencia del recorrido simulado', () => {
  it('la traza sintetica de verdad recorre la ruta', () => {
    // Si este test falla, los de arriba no prueban nada: significaria que el
    // generador de trazas no sigue la polilinea.
    const traza = walk(200);
    expect(traza.length).toBeGreaterThan(20);
    expect(distanceMeters(traza[0]!, { lng: COORDS[0]![0], lat: COORDS[0]![1] })).toBeLessThan(2);
    const fin = COORDS[COORDS.length - 1]!;
    expect(distanceMeters(traza.at(-1)!, { lng: fin[0], lat: fin[1] })).toBeLessThan(210);
  });
});
