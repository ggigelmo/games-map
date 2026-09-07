/**
 * De donde sale el rumbo del mapa: del GPS o de la brujula.
 *
 * Vive aparte de MapView, y es logica pura, porque es la regla que de verdad
 * decide el comportamiento y no hay forma de comprobarla en un navegador de
 * escritorio: haria falta moverse y girar un movil. Aqui si se puede probar.
 */

/**
 * Velocidad (m/s) por debajo de la cual el rumbo del GPS es ruido. ~5,4 km/h.
 *
 * El GPS no sabe hacia donde MIRAS, solo hacia donde te has desplazado. Parado
 * o andando despacio ese vector da bandazos de 180 grados.
 */
export const GPS_HEADING_MIN_SPEED = 1.5;

/**
 * Cuanto sigue mandando el GPS tras la ultima lectura en movimiento.
 *
 * Sin esta inercia, cada semaforo devolveria el mando a la brujula y el mapa
 * giraria segun como sostengas el movil en vez de segun la direccion del coche.
 */
export const GPS_HEADING_TTL_MS = 6_000;

/** ¿El rumbo de esta lectura de GPS es fiable? */
export function gpsHeadingUsable(heading: number | null, speed: number | null): boolean {
  return heading !== null && !Number.isNaN(heading) && (speed ?? 0) >= GPS_HEADING_MIN_SPEED;
}

/** ¿Manda la brujula en este instante, o el GPS conserva la prioridad? */
export function compassWins(now: number, gpsHeadingUntil: number): boolean {
  return now >= gpsHeadingUntil;
}
