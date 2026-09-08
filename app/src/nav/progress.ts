/**
 * Que giro viene y cuanto queda. Logica pura sobre el resultado de snapToRoute.
 */
import type { Maneuver, Route } from '../services/routing';
import type { Snapped } from './snap';

export interface Progress {
  /** La maniobra que tienes por delante, o null si ya no queda ninguna. */
  next: Maneuver | null;
  /** Metros hasta esa maniobra. */
  distanceToNextM: number;
  /** Metros que quedan de viaje. */
  remainingM: number;
  /** Segundos que quedan de viaje. */
  remainingS: number;
}

/**
 * `begin_shape_index` de Valhalla marca DONDE ocurre la maniobra. Estando entre
 * la maniobra i y la i+1, el giro que hay que anunciar es el de la i+1: la i es
 * la que ya ejecutaste (o el "salga y siga por tal calle" inicial).
 */
export function computeProgress(
  snapped: Snapped,
  route: Route,
  cumulative: number[],
): Progress {
  const totalM = cumulative[cumulative.length - 1] ?? 0;
  const remainingM = Math.max(0, totalM - snapped.alongM);

  const next = route.maneuvers.find((m) => m.beginIndex > snapped.index) ?? null;

  const distanceToNextM = next
    ? Math.max(0, (cumulative[next.beginIndex] ?? totalM) - snapped.alongM)
    : remainingM;

  return { next, distanceToNextM, remainingM, remainingS: remainingSeconds(snapped, route) };
}

/**
 * Tiempo restante sumando el de las maniobras que quedan.
 *
 * Prorratear sobre la distancia total seria mas simple pero mentiria en cuanto
 * el viaje mezcle ciudad y autovia: los mismos metros no cuestan lo mismo.
 * Aqui se suma el tiempo de cada maniobra pendiente y se prorratea solo el
 * tramo de la que estas recorriendo ahora.
 */
function remainingSeconds(snapped: Snapped, route: Route): number {
  const ms = route.maneuvers;
  let total = 0;
  let actual: Maneuver | null = null;

  for (const m of ms) {
    if (m.beginIndex > snapped.index) total += m.timeS;
    else actual = m;
  }

  if (actual) {
    // Fraccion del tramo actual que queda por recorrer, en vertices.
    const siguiente = ms.find((m) => m.beginIndex > snapped.index);
    const finIndex = siguiente ? siguiente.beginIndex : snapped.index + 1;
    const largo = Math.max(1, finIndex - actual.beginIndex);
    const hecho = Math.max(0, Math.min(largo, snapped.index - actual.beginIndex));
    total += actual.timeS * (1 - hecho / largo);
  }

  return Math.max(0, total);
}
