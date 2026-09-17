import { formatDistance, formatDuration } from '../services/geo-math';
import type { Route } from '../services/routing';

/** Route summary card: where you're going, how far is left, and how to clear it. */
export class RouteCard {
  readonly el = document.createElement('div');
  onClear: (() => void) | null = null;
  onGo: (() => void) | null = null;

  private destination: HTMLElement;
  private figures: HTMLElement;
  private goBtn: HTMLElement;

  constructor() {
    this.el.className = 'panel route-card';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="route-card__text">
        <div class="label">Destination</div>
        <div class="route-card__dest" data-dest></div>
        <div class="num route-card__figs" data-figs></div>
      </div>
      <button class="btn route-card__go">Go</button>
      <button class="route-card__x" aria-label="Clear route">&times;</button>`;

    this.destination = this.el.querySelector('[data-dest]')!;
    this.figures = this.el.querySelector('[data-figs]')!;
    this.goBtn = this.el.querySelector('.route-card__go')!;
    this.el.querySelector('.route-card__x')!.addEventListener('click', () => this.onClear?.());
    this.el.querySelector('.route-card__go')!.addEventListener('click', () => this.onGo?.());
  }

  show(destination: string, route: Route) {
    this.paint(
      destination,
      `${formatDistance(route.distanceKm * 1000)}  ·  ${formatDuration(route.durationS)}`,
      false,
      true,
    );
  }

  /** While Valhalla is responding. Without this there's no signal anything is happening. */
  showPending(destination: string) {
    this.paint(destination, 'Calculating route…', false);
  }

  showError(destination: string, message: string) {
    this.paint(destination, message, true);
  }

  hide() {
    this.el.hidden = true;
  }

  private paint(destination: string, figures: string, isError: boolean, canGo = false) {
    this.destination.textContent = destination;
    this.figures.textContent = figures;
    this.el.classList.toggle('panel--bad', isError);
    // GO only appears once a route has actually been calculated: not while
    // it's pending, nor if it failed.
    this.goBtn.hidden = !canGo;
    this.el.hidden = false;
  }
}
