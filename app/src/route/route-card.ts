import { formatDistance, formatDuration } from '../services/geo-math';
import type { Route } from '../services/routing';

/** Tarjeta de resumen de la ruta: a donde vas, cuanto queda y como borrarla. */
export class RouteCard {
  readonly el = document.createElement('div');
  onClear: (() => void) | null = null;
  onGo: (() => void) | null = null;

  private destino: HTMLElement;
  private cifras: HTMLElement;
  private goBtn: HTMLElement;

  constructor() {
    this.el.className = 'panel route-card';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="route-card__text">
        <div class="label">Destino</div>
        <div class="route-card__dest" data-dest></div>
        <div class="num route-card__figs" data-figs></div>
      </div>
      <button class="btn route-card__go">Ir</button>
      <button class="route-card__x" aria-label="Borrar ruta">&times;</button>`;

    this.destino = this.el.querySelector('[data-dest]')!;
    this.cifras = this.el.querySelector('[data-figs]')!;
    this.goBtn = this.el.querySelector('.route-card__go')!;
    this.el.querySelector('.route-card__x')!.addEventListener('click', () => this.onClear?.());
    this.el.querySelector('.route-card__go')!.addEventListener('click', () => this.onGo?.());
  }

  show(destino: string, route: Route) {
    this.paint(
      destino,
      `${formatDistance(route.distanceKm * 1000)}  ·  ${formatDuration(route.durationS)}`,
      false,
      true,
    );
  }

  /** Mientras Valhalla responde. Sin esto no hay senal de que algo pasa. */
  showPending(destino: string) {
    this.paint(destino, 'Calculando ruta…', false);
  }

  showError(destino: string, mensaje: string) {
    this.paint(destino, mensaje, true);
  }

  hide() {
    this.el.hidden = true;
  }

  private paint(destino: string, cifras: string, malo: boolean, puedeIr = false) {
    this.destino.textContent = destino;
    this.cifras.textContent = cifras;
    this.el.classList.toggle('panel--bad', malo);
    // IR solo aparece con una ruta ya calculada: no mientras se pide, ni si fallo.
    this.goBtn.hidden = !puedeIr;
    this.el.hidden = false;
  }
}
