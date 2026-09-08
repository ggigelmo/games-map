/**
 * Deteccion de desvio. En la fase 3a solo detecta, para que la tarjeta pueda
 * decir FUERA DE RUTA en vez de seguir dando indicaciones de una ruta que ya no
 * sigues. El recalculo automatico llega en la 3b.
 *
 * Reductor puro: entra el estado anterior y una lectura, sale el estado nuevo.
 */

/** Nunca se baja de aqui, por muy fino que diga ser el GPS. */
const FLOOR_M = 35;

/** Cuantas lecturas seguidas fuera hacen falta para declararlo. */
const STREAK_TO_DECLARE = 3;

export interface OffRouteState {
  /** Lecturas consecutivas por encima del umbral. */
  streak: number;
  off: boolean;
}

export const initialOffRoute: OffRouteState = { streak: 0, off: false };

/**
 * Umbral atado a la precision de CADA lectura, no fijo.
 *
 * Con un umbral fijo de 30 m, un fix de +-50 m en una calle estrecha lo dispara
 * constantemente y la app se pasa el viaje creyendo que te has salido. La
 * precision del GPS tiene que entrar en la cuenta.
 */
export function offRouteThreshold(accuracyM: number): number {
  return Math.max(FLOOR_M, accuracyM * 2.5);
}

export function updateOffRoute(
  state: OffRouteState,
  distanceM: number,
  accuracyM: number,
): OffRouteState {
  const fuera = distanceM > offRouteThreshold(accuracyM);

  if (!fuera) {
    // Una sola lectura buena basta para volver: si estas sobre la ruta, estas
    // sobre la ruta. La histeresis es solo para DECLARAR el desvio.
    return initialOffRoute;
  }

  const streak = state.streak + 1;
  return { streak, off: state.off || streak >= STREAK_TO_DECLARE };
}
