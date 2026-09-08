/**
 * Estado de la navegacion. La unica parte impura de `nav/`: mantiene el estado,
 * consume las lecturas del GPS, llama a las funciones puras y avisa a la UI.
 *
 *   idle ──(elige destino)──▶ preview ──(IR)──▶ navigating ──(PARAR)──▶ idle
 *                                └──────────(X)──────────────────────────┘
 */
import type { Point } from '../services/geo-math';
import type { Fix } from '../services/geolocation';
import type { Route } from '../services/routing';
import { initialOffRoute, updateOffRoute, type OffRouteState } from './off-route';
import { computeProgress, type Progress } from './progress';
import { cumulativeMeters, snapToRoute, type Snapped } from './snap';

export type NavPhase = 'idle' | 'preview' | 'navigating';

export interface NavUpdate {
  progress: Progress;
  snapped: Snapped;
  offRoute: boolean;
  /** Hay un recalculo en vuelo. */
  rerouting: boolean;
}

/** A donde vas: hace falta la posicion, no solo el nombre, para recalcular. */
export interface Destination extends Point {
  label: string;
}

/** Metros al destino por debajo de los cuales se considera que has llegado. */
const ARRIVAL_M = 40;

/**
 * Minimo entre recalculos.
 *
 * Sin este freno, un desvio persistente (una calle mal cartografiada, un atajo
 * deliberado) pediria una ruta nueva en cada lectura del GPS: varias por
 * segundo contra la API, y la tarjeta parpadeando sin parar.
 */
const MIN_REROUTE_MS = 15_000;

export class NavSession {
  private _phase: NavPhase = 'idle';
  private _route: Route | null = null;
  private cumulative: number[] = [];
  private lastIndex = 0;
  private off: OffRouteState = initialOffRoute;
  private _destination: Destination | null = null;
  private _rerouting = false;
  /**
   * -Infinity, no 0: cero es una marca de tiempo LEGITIMA (la que devuelve
   * performance.now() recien arrancado), asi que usarlo de centinela de "nunca"
   * anulaba el freno entre recalculos. Lo cazo un test con reloj falso.
   */
  private lastRerouteAt = -Infinity;

  onPhase: ((phase: NavPhase) => void) | null = null;
  onUpdate: ((update: NavUpdate) => void) | null = null;
  onArrived: (() => void) | null = null;

  /**
   * Hace falta una ruta nueva desde `from`. Quien escucha hace la peticion y
   * responde con `replaceRoute()` o `rerouteFailed()`.
   *
   * La sesion no habla con la red a proposito: asi no depende de HTTP y se
   * puede probar entera con lecturas sinteticas.
   */
  onNeedsReroute: ((from: Fix, to: Destination) => void) | null = null;

  get destination(): Destination | null {
    return this._destination;
  }

  get rerouting(): boolean {
    return this._rerouting;
  }

  get phase(): NavPhase {
    return this._phase;
  }

  get route(): Route | null {
    return this._route;
  }

  /** Ruta calculada: pasa a vista previa, sin empezar a navegar. */
  preview(route: Route, destination: Destination) {
    this._destination = destination;
    this.adopt(route);
    this.setPhase('preview');
  }

  /**
   * Ruta nueva tras un desvio. No cambia de fase: sigues navegando, solo por
   * otro camino.
   */
  replaceRoute(route: Route) {
    if (this._phase !== 'navigating') return;
    this._rerouting = false;
    this.adopt(route);
  }

  /** El recalculo no salio. Se reintentara pasado el intervalo minimo. */
  rerouteFailed() {
    this._rerouting = false;
  }

  /** Estado derivado de una ruta, se estrene o se sustituya. */
  private adopt(route: Route) {
    this._route = route;
    // Se calcula una vez por ruta, no en cada lectura del GPS.
    this.cumulative = cumulativeMeters(route.coordinates);
    this.lastIndex = 0;
    this.off = initialOffRoute;
  }

  /** El usuario ha pulsado IR. */
  start() {
    if (!this._route) return;
    this.setPhase('navigating');
  }

  /** PARAR, la X, o haber llegado. */
  stop() {
    this._route = null;
    this.cumulative = [];
    this._destination = null;
    this.lastIndex = 0;
    this.off = initialOffRoute;
    this._rerouting = false;
    this.lastRerouteAt = -Infinity;
    this.setPhase('idle');
  }

  /**
   * Una lectura nueva del GPS. Solo hace algo navegando: en vista previa la
   * ruta no cambia por moverte un poco.
   */
  consume(fix: Fix) {
    if (this._phase !== 'navigating' || !this._route) return;

    const snapped = snapToRoute(fix, this._route.coordinates, this.cumulative, this.lastIndex);
    this.lastIndex = snapped.index;

    this.off = updateOffRoute(this.off, snapped.distanceM, fix.accuracy);
    const progress = computeProgress(snapped, this._route, this.cumulative);

    if (this.off.off) this.maybeReroute(fix);

    this.onUpdate?.({
      progress,
      snapped,
      offRoute: this.off.off,
      rerouting: this._rerouting,
    });

    // Llegar solo cuenta si de verdad estas sobre la ruta: fuera de ella, la
    // distancia restante no significa nada.
    if (!this.off.off && progress.remainingM < ARRIVAL_M) {
      // Parar primero: `stop()` lleva a la fase idle, que limpia la interfaz.
      // Avisando antes, el mensaje de llegada se borraria a si mismo.
      this.stop();
      this.onArrived?.();
    }
  }

  /** Pide ruta nueva si toca: fuera de ruta, sin otra en vuelo, y sin prisa. */
  private maybeReroute(fix: Fix) {
    if (this._rerouting || !this._destination || !this.onNeedsReroute) return;

    const now = performance.now();
    if (now - this.lastRerouteAt < MIN_REROUTE_MS) return;

    this.lastRerouteAt = now;
    this._rerouting = true;
    this.onNeedsReroute(fix, this._destination);
  }

  private setPhase(phase: NavPhase) {
    if (this._phase === phase) return;
    this._phase = phase;
    this.onPhase?.(phase);
  }
}
