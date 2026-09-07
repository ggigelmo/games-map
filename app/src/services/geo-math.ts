/**
 * Matematicas geograficas. Logica pura y sin dependencias, para poder probarla
 * sin navegador. La fase 3 (snapToRoute, distancia a la siguiente maniobra)
 * se apoyara en esto.
 */

export interface Point {
  lng: number;
  lat: number;
}

const R = 6_371_008.8; // radio medio terrestre en metros
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Distancia sobre la esfera entre dos puntos, en metros (haversine).
 *
 * Es de sobra para lo que hace esta app: a escala de ciudad el error frente a
 * un elipsoide esta por debajo del propio error del GPS.
 */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** "850 m" / "12,4 km" — como lo escribiria un navegador en espanol. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

/** "7 min" / "1 h 12 min" */
export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}
