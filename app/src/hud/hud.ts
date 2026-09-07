import type { Fix } from '../map/map';

/** Velocimetro + lecturas, con el chrome de esquinas cortadas. */
export class Hud {
  readonly el = document.createElement('div');
  private speedNum: HTMLElement;
  private rows: Record<'rumbo' | 'precision' | 'coords', HTMLElement>;

  constructor() {
    this.el.className = 'hud-top';
    this.el.innerHTML = `
      <div class="panel speed">
        <div class="num" data-speed>--</div>
        <div class="unit">km/h</div>
      </div>
      <div class="panel readout">
        <span class="label">Rumbo</span><span class="num" data-rumbo>--</span>
        <span class="label">Precision</span><span class="num" data-precision>--</span>
        <span class="label">Posicion</span><span class="num" data-coords>--</span>
      </div>`;

    const q = <T extends HTMLElement>(sel: string) => this.el.querySelector(sel) as T;
    this.speedNum = q('[data-speed]');
    this.rows = {
      rumbo: q('[data-rumbo]'),
      precision: q('[data-precision]'),
      coords: q('[data-coords]'),
    };
  }

  update(fix: Fix) {
    // coords.speed viene en m/s y es null cuando el GPS no lo sabe.
    this.speedNum.textContent =
      fix.speed === null || Number.isNaN(fix.speed)
        ? '--'
        : Math.max(0, Math.round(fix.speed * 3.6)).toString();

    this.rows.rumbo.textContent =
      fix.heading === null || Number.isNaN(fix.heading)
        ? '--'
        : `${Math.round(fix.heading)}\u00b0 ${cardinal(fix.heading)}`;

    this.rows.precision.textContent = `\u00b1${fix.accuracy.toFixed(0)} m`;
    this.rows.coords.textContent = `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`;
  }
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;
const cardinal = (deg: number) => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
