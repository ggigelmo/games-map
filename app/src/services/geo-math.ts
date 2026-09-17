/**
 * Geographic math. Pure logic with no dependencies, so it can be tested
 * without a browser. Phase 3 (snapToRoute, distance to the next maneuver)
 * will build on this.
 */

export interface Point {
  lng: number;
  lat: number;
}

const R = 6_371_008.8; // mean Earth radius in meters
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Distance over the sphere between two points, in meters (haversine).
 *
 * This is more than enough for what this app does: at city scale, the error
 * versus an ellipsoid is below the GPS's own error margin.
 */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** "850 m" / "12.4 km" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** "7 min" / "1 h 12 min" */
export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}
