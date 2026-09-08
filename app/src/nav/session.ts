/**
 * Estado de la navegacion. La unica parte impura de `nav/`: mantiene el estado,
 * consume las lecturas del GPS, llama a las funciones puras y avisa a la UI.
 *
 *   idle ──(elige destino)──▶ preview ──(IR)──▶ navigating ──(PARAR)──▶ idle
 *                                └──────────(X)──────────────────────────┘
 */
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
}

/** Metros al destino por debajo de los cuales se considera que has llegado. */
const ARRIVAL_M = 40;

export class NavSession {
  private _phase: NavPhase = 'idle';
  private _route: Route | null = null;
  private cumulative: number[] = [];
  private lastIndex = 0;
  private off: OffRouteState = initialOffRoute;

  destination = '';

  onPhase: ((phase: NavPhase) => void) | null = null;
  onUpdate: ((update: NavUpdate) => void) | null = null;
  onArrived: (() => void) | null = null;

  get phase(): NavPhase {
    return this._phase;
  }

  get route(): Route | null {
    return this._route;
  }

  /** Ruta calculada: pasa a vista previa, sin empezar a navegar. */
  preview(route: Route, destination: string) {
    this._route = route;
    this.destination = destination;
    // Se calcula una vez por ruta, no en cada lectura del GPS.
    this.cumulative = cumulativeMeters(route.coordinates);
    this.lastIndex = 0;
    this.off = initialOffRoute;
    this.setPhase('preview');
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
    this.destination = '';
    this.lastIndex = 0;
    this.off = initialOffRoute;
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

    this.onUpdate?.({ progress, snapped, offRoute: this.off.off });

    // Llegar solo cuenta si de verdad estas sobre la ruta: fuera de ella, la
    // distancia restante no significa nada.
    if (!this.off.off && progress.remainingM < ARRIVAL_M) {
      // Parar primero: `stop()` lleva a la fase idle, que limpia la interfaz.
      // Avisando antes, el mensaje de llegada se borraria a si mismo.
      this.stop();
      this.onArrived?.();
    }
  }

  private setPhase(phase: NavPhase) {
    if (this._phase === phase) return;
    this._phase = phase;
    this.onPhase?.(phase);
  }
}
