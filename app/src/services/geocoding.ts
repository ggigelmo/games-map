import { distanceMeters, type Point } from './geo-math';
import { stadiaGet } from './stadia';

/** Un resultado de busqueda, ya masticado para la interfaz. */
export interface Place {
  id: string;
  /** "Gran Via, Madrid, Espana" */
  label: string;
  lng: number;
  lat: number;
  /** metros desde donde estas, o null si aun no hay posicion */
  distanceM: number | null;
}

interface PeliasResponse {
  features: {
    properties: { gid?: string; label?: string; name?: string };
    geometry: { coordinates: [number, number] };
  }[];
}

/** Por debajo de esto los resultados son ruido y gastan peticiones. */
export const MIN_QUERY_LENGTH = 3;

/**
 * Autocompletado de destinos.
 *
 * `near` sesga los resultados hacia donde estas: sin eso, buscar "gran via"
 * devuelve calles con ese nombre de todo el pais en vez de la de tu ciudad.
 *
 * El `signal` es imprescindible, no un adorno: quien llama debe cancelar la
 * peticion anterior en cada pulsacion. Si no, las respuestas llegan
 * desordenadas y la lista parpadea mostrando resultados de consultas viejas.
 */
export async function autocomplete(
  text: string,
  near: Point | null,
  signal?: AbortSignal,
): Promise<Place[]> {
  const params: Record<string, string | number> = {
    text,
    lang: 'es',
    size: 8,
  };
  if (near) {
    params['focus.point.lat'] = near.lat;
    params['focus.point.lon'] = near.lng;
  }

  const data = await stadiaGet<PeliasResponse>('/geocoding/v1/autocomplete', params, signal);

  return (data.features ?? []).map((f, i) => {
    const [lng, lat] = f.geometry.coordinates;
    return {
      id: f.properties.gid ?? `${lng},${lat},${i}`,
      label: f.properties.label ?? f.properties.name ?? 'Sin nombre',
      lng,
      lat,
      distanceM: near ? distanceMeters(near, { lng, lat }) : null,
    };
  });
}
