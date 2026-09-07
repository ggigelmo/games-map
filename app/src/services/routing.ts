import type { Point } from './geo-math';
import { stadiaGet } from './stadia';

/**
 * Una maniobra de la ruta. Valhalla ya redacta el texto para leerlo en voz
 * alta, en el idioma que se le pida; la fase 3 solo tendra que decidir CUANDO
 * pronunciarlo, no que decir.
 */
export interface Maneuver {
  instruction: string;
  /** Redactada para sintesis de voz, o undefined si Valhalla no la dio */
  verbal: string | undefined;
  /** indice dentro de `coordinates` donde empieza la maniobra */
  beginIndex: number;
  lengthKm: number;
  timeS: number;
}

export interface Route {
  /** [lng, lat][], listo para meter en un GeoJSON */
  coordinates: [number, number][];
  distanceKm: number;
  durationS: number;
  maneuvers: Maneuver[];
  /** [[oeste, sur], [este, norte]] */
  bounds: [[number, number], [number, number]];
}

interface ValhallaResponse {
  trip: {
    summary: { length: number; time: number };
    legs: {
      shape: string;
      maneuvers: {
        instruction?: string;
        verbal_pre_transition_instruction?: string;
        begin_shape_index: number;
        length: number;
        time: number;
      }[];
    }[];
  };
}

/**
 * Decodifica una polilinea codificada de Google/Valhalla.
 *
 * OJO CON `precision`: Valhalla usa **6**, no 5. Google Maps y casi todos los
 * ejemplos que se encuentran por ahi usan 5, y con 5 esto no falla, sino algo
 * peor: devuelve coordenadas de aspecto normal pero diez veces mas pequenas,
 * asi que la ruta aparece dibujada a cientos de kilometros del sitio. Por eso
 * esta funcion tiene un test.
 *
 * @returns pares [lng, lat] en orden GeoJSON, no [lat, lng]
 */
export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const nextValue = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    // Bit bajo a 1 = negativo, en complemento a uno.
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += nextValue();
    lng += nextValue();
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

function boundsOf(coords: [number, number][]): Route['bounds'] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [
    [w, s],
    [e, n],
  ];
}

/** Calcula una ruta en coche entre dos puntos. */
export async function route(from: Point, to: Point, signal?: AbortSignal): Promise<Route> {
  const request = {
    locations: [
      { lat: from.lat, lon: from.lng },
      { lat: to.lat, lon: to.lng },
    ],
    costing: 'auto',
    directions_options: { language: 'es-ES', units: 'kilometers' },
  };

  const data = await stadiaGet<ValhallaResponse>(
    '/route/v1',
    { json: JSON.stringify(request) },
    signal,
  );

  // Con dos puntos siempre hay un tramo, pero concatenar es igual de barato y
  // deja la puerta abierta a paradas intermedias sin tocar nada.
  const coordinates: [number, number][] = [];
  const maneuvers: Maneuver[] = [];
  for (const leg of data.trip.legs) {
    const offset = coordinates.length;
    coordinates.push(...decodePolyline(leg.shape));
    for (const m of leg.maneuvers) {
      maneuvers.push({
        instruction: m.instruction ?? '',
        verbal: m.verbal_pre_transition_instruction,
        beginIndex: offset + m.begin_shape_index,
        lengthKm: m.length,
        timeS: m.time,
      });
    }
  }

  return {
    coordinates,
    distanceKm: data.trip.summary.length,
    durationS: data.trip.summary.time,
    maneuvers,
    bounds: boundsOf(coordinates),
  };
}
