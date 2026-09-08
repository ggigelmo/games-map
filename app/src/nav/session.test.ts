import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Fix } from '../services/geolocation';
import { decodePolyline, type Maneuver, type Route } from '../services/routing';
import { MADRID_SHAPE } from '../services/routing.fixture';
import { NavSession, type Destination } from './session';

/**
 * La sesion no habla con la red ni toca el DOM, asi que la maquina de estados
 * del recalculo se puede probar entera con lecturas sinteticas. Es lo unico de
 * esto que se puede demostrar sin conducir.
 */

const COORDS = decodePolyline(MADRID_SHAPE);

function rutaDe(coords: [number, number][]): Route {
  const N = coords.length;
  const maniobras: Maneuver[] = [0, Math.floor(N * 0.4), N - 1].map((beginIndex, i) => ({
    instruction: `maniobra ${i}`,
    type: i === 0 ? 1 : 15,
    streetNames: [`Calle ${i}`],
    verbal: undefined,
    verbalAlert: undefined,
    beginIndex,
    lengthKm: 1,
    timeS: 100,
  }));
  return {
    coordinates: coords,
    distanceKm: 5,
    durationS: 300,
    maneuvers: maniobras,
    bounds: [
      [0, 0],
      [0, 0],
    ],
  };
}

const DESTINO: Destination = { label: 'Chamartin', lng: -3.6883, lat: 40.453 };

/** Lectura sobre el vertice `i` de la ruta. */
const enRuta = (i: number): Fix => ({
  lng: COORDS[i]![0],
  lat: COORDS[i]![1],
  heading: 90,
  speed: 12,
  accuracy: 8,
  at: performance.now(),
});

/** Lectura desviada ~400 m del vertice `i`. */
const desviado = (i: number): Fix => ({ ...enRuta(i), lat: COORDS[i]![1] + 0.0036 });

describe('recalculo automatico', () => {
  let nav: NavSession;
  let peticiones: Destination[];

  beforeEach(() => {
    // performance.now() tiene que ser controlable: el freno entre recalculos
    // depende de el, y sin tiempo falso el test tardaria 15 segundos reales.
    vi.useFakeTimers();
    nav = new NavSession();
    peticiones = [];
    nav.onNeedsReroute = (_from, to) => peticiones.push(to);
    nav.preview(rutaDe(COORDS), DESTINO);
    nav.start();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no pide nada mientras vas por la ruta', () => {
    for (const i of [0, 20, 40, 60, 80]) nav.consume(enRuta(i));
    expect(peticiones).toHaveLength(0);
    expect(nav.rerouting).toBe(false);
  });

  it('pide ruta nueva al declararse el desvio, con el destino original', () => {
    nav.consume(desviado(50));
    nav.consume(desviado(50));
    expect(peticiones).toHaveLength(0); // aun no: hacen falta tres

    nav.consume(desviado(50));
    expect(peticiones).toEqual([DESTINO]);
    expect(nav.rerouting).toBe(true);
  });

  it('no pide otra mientras la primera esta en vuelo', () => {
    for (let i = 0; i < 8; i++) nav.consume(desviado(50));
    expect(peticiones).toHaveLength(1);
  });

  it('respeta el minimo de 15 s entre intentos si el primero falla', () => {
    for (let i = 0; i < 3; i++) nav.consume(desviado(50));
    expect(peticiones).toHaveLength(1);

    nav.rerouteFailed();
    expect(nav.rerouting).toBe(false);

    // Justo antes del limite: todavia no.
    vi.advanceTimersByTime(14_000);
    nav.consume(desviado(50));
    expect(peticiones).toHaveLength(1);

    // Pasado el limite: reintenta.
    vi.advanceTimersByTime(2_000);
    nav.consume(desviado(50));
    expect(peticiones).toHaveLength(2);
  });

  it('la ruta nueva te devuelve a la ruta sin salir de navegacion', () => {
    for (let i = 0; i < 3; i++) nav.consume(desviado(50));

    // Ruta nueva que arranca donde estas: un tramo desde el desvio.
    const nueva = rutaDe(COORDS.slice(50));
    nav.replaceRoute(nueva);

    expect(nav.rerouting).toBe(false);
    expect(nav.phase).toBe('navigating');
    expect(nav.route).toBe(nueva);

    // Y el estado de desvio se reinicia: sobre la ruta nueva estas dentro.
    const actualizaciones: boolean[] = [];
    nav.onUpdate = (u) => actualizaciones.push(u.offRoute);
    nav.consume({ ...enRuta(50) });
    expect(actualizaciones).toEqual([false]);
  });

  it('PARAR corta el recalculo y olvida el destino', () => {
    for (let i = 0; i < 3; i++) nav.consume(desviado(50));
    expect(nav.rerouting).toBe(true);

    nav.stop();
    expect(nav.phase).toBe('idle');
    expect(nav.rerouting).toBe(false);
    expect(nav.destination).toBeNull();

    // Y una lectura posterior no reactiva nada.
    nav.consume(desviado(50));
    expect(peticiones).toHaveLength(1);
  });

  it('replaceRoute no hace nada si ya has parado', () => {
    nav.stop();
    nav.replaceRoute(rutaDe(COORDS));
    expect(nav.phase).toBe('idle');
    expect(nav.route).toBeNull();
  });

  it('en vista previa no consume lecturas ni recalcula', () => {
    const otra = new NavSession();
    const pedidas: Destination[] = [];
    otra.onNeedsReroute = (_f, to) => pedidas.push(to);
    otra.preview(rutaDe(COORDS), DESTINO);
    // Sin start(): sigues decidiendo, moverte no debe disparar nada.
    for (let i = 0; i < 5; i++) otra.consume(desviado(50));
    expect(pedidas).toHaveLength(0);
  });
});
