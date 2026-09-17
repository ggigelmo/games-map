import { distanceMeters, type Point } from './geo-math';
import { stadiaGet } from './stadia';

/** A search result, already massaged for the UI. */
export interface Place {
  id: string;
  /** "Gran Via, Madrid, Spain" */
  label: string;
  lng: number;
  lat: number;
  /** meters from where you are, or null if there's no position yet */
  distanceM: number | null;
}

interface PeliasResponse {
  features: {
    properties: { gid?: string; label?: string; name?: string };
    geometry: { coordinates: [number, number] };
  }[];
}

/** Below this, results are just noise and waste requests. */
export const MIN_QUERY_LENGTH = 3;

/**
 * Destination autocomplete.
 *
 * `near` biases results toward where you are: without it, searching "gran
 * via" returns streets with that name from the whole country instead of the
 * one in your city.
 *
 * The `signal` is essential, not decoration: the caller must cancel the
 * previous request on every keystroke. Otherwise responses arrive out of
 * order and the list flickers showing results from stale queries.
 */
export async function autocomplete(
  text: string,
  near: Point | null,
  signal?: AbortSignal,
): Promise<Place[]> {
  const params: Record<string, string | number> = {
    text,
    lang: 'en',
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
      label: f.properties.label ?? f.properties.name ?? 'No name',
      lng,
      lat,
      distanceM: near ? distanceMeters(near, { lng, lat }) : null,
    };
  });
}
