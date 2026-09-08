import { describe, expect, it } from 'vitest';

import { decodePolyline } from './routing';
import { distanceMeters, formatDistance, formatDuration } from './geo-math';
import { DESTINO, MADRID_SHAPE, ORIGEN } from './routing.fixture';


describe('decodePolyline', () => {
  it('decodifica la ruta dentro de Madrid con la precision por defecto', () => {
    const coords = decodePolyline(MADRID_SHAPE);

    expect(coords.length).toBeGreaterThan(100);

    // Valhalla engancha los extremos a la calzada mas cercana, asi que no
    // coinciden con lo pedido: el destino de esta ruta se desplaza 120 m porque
    // el punto caia dentro del complejo de Chamartin.
    //
    // El margen es de 250 m a proposito. No hace falta ser mas estricto: un
    // fallo de decodificacion no se equivoca por metros, se equivoca por
    // millones (lo comprueba el test de precision 5). Apretarlo mas solo daria
    // falsos positivos cuando cambie el callejero de OpenStreetMap.
    const primero = { lng: coords[0]![0], lat: coords[0]![1] };
    const ultimo = { lng: coords.at(-1)![0], lat: coords.at(-1)![1] };
    expect(distanceMeters(primero, ORIGEN)).toBeLessThan(250);
    expect(distanceMeters(ultimo, DESTINO)).toBeLessThan(250);
  });

  it('devuelve pares [lng, lat], no [lat, lng]', () => {
    // Confundir el orden es facil y silencioso: la ruta apareceria en el mar
    // frente a Somalia, que es donde caen las coordenadas invertidas.
    for (const [lng, lat] of decodePolyline(MADRID_SHAPE)) {
      expect(lng).toBeGreaterThan(-4);
      expect(lng).toBeLessThan(-3.5);
      expect(lat).toBeGreaterThan(40);
      expect(lat).toBeLessThan(41);
    }
  });

  it('con precision 5 la ruta se va lejisimos: el fallo que este test vigila', () => {
    // Valhalla usa precision 6. Casi todos los ejemplos que se encuentran por
    // ahi usan 5, porque es lo que usa Google. Con 5 esto no lanza ningun
    // error: devuelve coordenadas de aspecto perfectamente normal, diez veces
    // mas pequenas. La ruta se dibuja en mitad del Golfo de Guinea.
    const malas = decodePolyline(MADRID_SHAPE, 5);
    const primero = { lng: malas[0]![0], lat: malas[0]![1] };
    expect(distanceMeters(primero, ORIGEN)).toBeGreaterThan(1_000_000);
  });

  it('acepta una cadena vacia sin romperse', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('formato para la interfaz', () => {
  it('redondea metros y pasa a km cuando toca', () => {
    expect(formatDistance(834)).toBe('830 m');
    expect(formatDistance(5189)).toBe('5,2 km');
    expect(formatDistance(42_300)).toBe('42 km');
  });

  it('pasa a horas por encima de los 60 minutos', () => {
    expect(formatDuration(443)).toBe('7 min');
    expect(formatDuration(4320)).toBe('1 h 12 min');
  });
});
