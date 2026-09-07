import { describe, expect, it } from 'vitest';

import { decodePolyline } from './routing';
import { distanceMeters, formatDistance, formatDuration } from './geo-math';

/**
 * Polilinea real devuelta por Valhalla (Stadia Maps) para una ruta en coche de
 * Puerta del Sol a Chamartin, Madrid. Capturada de la API, no inventada.
 *
 * Ruta: 5,189 km / 443 s / 11 maniobras.
 */
const MADRID_SHAPE =
  '_s{alAbu`aFw@eCu@kBaB}A_h@mWcBq@mHbVgDlMy@bDi@`A{AZcCs@w@}@_CuDkLcLsLmHqNsKmB_A_BIeS_@eBMqBQJiDPkGFsBFuBj@yRNgFFqBFqBH}Cv@iX@_@HiILcLFqDBy@ZiJj@}Kf@oHP}Bf@}Fx@yHt@mG~@uG~C}QpA_Hf@gCf@iC~@aFtOcy@bB{I`Lul@lEqUTkALi@^aCbA_C^y@~E_Mf@mAl@{AbC_FaBmImA{IqBwOkAiKOmAa@kDm@}EGe@[eCeEm`@{B{To@cGe@aFQkD?K?s@A_DHwBBiANoBHs@RmBVwEb@iLPyH@eGMaFa@oD_BwFkBk@yN{BsDm@oGgAaGO{Ae@sfAq_@igAy_@_A]sGkCaC{@e`@}Mu@YoIuCqSkHa`@mNgSgHs@W}B}@cC_AuB_AuH_DqE}AcQiGqAc@cAOgAOmAIqAC_BPwCn@oCRqB?iBI_BCaCIkBMkFu@_AMg{Bo_@eEq@oF_AafAqQoGeAk`AcPkHmA{Ew@uoCsd@}DOsk@vF{m@vGsJVeC?iCO}@GcKsAwCFyCZ}A^{Ar@sAz@oAbAkAhA_AnAsCbEk@r@sH|H{FfEyD`CarAbx@kWvMiAl@yAt@qEfCcG`CcExAsN|EsAf@q@T{TbH_v@rQwf@xK_GjAaPlA{Lj@eVj@{Ev@aG~@qF`@sK_@aVwAaYiAkDIagAcFcTw@qr@qDgq@iDuMYcLTaEMmBIyAQajDeNqaAqEufAcFiF[{F]g@}Ee@yBq@sBi@mAgAmBaCoCcAu@gBaAsAsKGi@_@sFBmAf@qSPkHJaElAqh@FcCDcBDsA';

/** Lo que se le pidio a Valhalla. La ruta arranca pegada a estos puntos. */
const ORIGEN = { lng: -3.7038, lat: 40.4168 };
const DESTINO = { lng: -3.6883, lat: 40.453 };

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
