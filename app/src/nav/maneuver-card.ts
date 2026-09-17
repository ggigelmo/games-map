import { formatDistance, formatDuration } from '../services/geo-math';
import type { Maneuver } from '../services/routing';

/**
 * Next-turn card.
 *
 * The arrows are drawn as inline SVG, not sprites: they live in the HUD, not
 * on the map, so no SDF glyphs or sprite sheets are needed. They use
 * `currentColor`, so CSS decides the color.
 */

type Shape =
  | 'straight'
  | 'slight'
  | 'turn'
  | 'sharp'
  | 'uturn'
  | 'roundabout'
  | 'merge'
  | 'destination';

/**
 * Canonical arrowhead: points UP and is centered on the origin.
 *
 * It's positioned and rotated with a `transform`, instead of computing each
 * head's three vertices with trigonometry. The first attempt did that and it
 * produced three crooked arrows (sharp turn, roundabout, and merge): with the
 * canonical head, orientation is just a number of degrees and can't be wrong.
 */
const HEAD = 'M0 -7 L5.5 5 L-5.5 5 Z';

/** @param deg 0 up, 90 right, 180 down (clockwise) */
const head = (x: number, y: number, deg: number) =>
  `<path d="${HEAD}" class="fill" transform="translate(${x} ${y}) rotate(${deg})" />`;

/**
 * Only the RIGHT variant of each shape is drawn. The left ones are the same
 * mirrored horizontally: fewer paths and guaranteed symmetry.
 */
const SHAPES: Record<Shape, string> = {
  straight: `<path d="M16 29V13" />${head(16, 9, 0)}`,

  slight: `<path d="M14 29V20 L20 12" />${head(22.5, 8.5, 45)}`,

  turn: `<path d="M12 29V17 Q12 14 15 14 H19" />${head(23, 14, 90)}`,

  // Sharp turn: the head points down-right, not just right.
  sharp: `<path d="M12 29V19 Q12 15 16 15.5 L18.5 16.5" />${head(22, 20, 135)}`,

  uturn: `<path d="M11 29V17 Q11 10 18 10 Q25 10 25 17V19" />${head(25, 23, 180)}`,

  // You enter from below, loop around, and exit upward to the right. With the
  // exit drawn horizontally it read as a lollipop, not a roundabout.
  roundabout:
    `<circle cx="15" cy="14.5" r="6" />` +
    `<path d="M15 29V20.5" />` +
    `<path d="M19.3 10.2 L20.8 8.7" />` +
    head(23, 6.5, 45),

  // Straight main road with a secondary one merging in from the right.
  merge: `<path d="M14 29V13" /><path d="M24 27 Q24 19 15.5 16" />${head(14, 9, 0)}`,

  destination:
    `<path d="M16 4 C10.5 4 6 8.5 6 14 C6 21 16 29 16 29 C16 29 26 21 26 14 C26 8.5 21.5 4 16 4 Z" class="fill" />` +
    `<circle cx="16" cy="13.5" r="3.6" class="hole" />`,
};

/**
 * Valhalla maneuver types. It's a numeric enum and not all of them deserve
 * their own arrow: ramps and "keep right" are drawn as a slight turn, which
 * is what they mean at the wheel.
 */
function arrowFor(type: number): { shape: Shape; flip: boolean } {
  switch (type) {
    case 4:
    case 5:
    case 6:
      return { shape: 'destination', flip: false };
    case 9: // slight right
    case 18: // ramp right
    case 20: // exit right
    case 23: // keep right
      return { shape: 'slight', flip: false };
    case 16: // slight left
    case 19:
    case 21:
    case 24:
      return { shape: 'slight', flip: true };
    case 10:
      return { shape: 'turn', flip: false };
    case 15:
      return { shape: 'turn', flip: true };
    case 11:
      return { shape: 'sharp', flip: false };
    case 14:
      return { shape: 'sharp', flip: true };
    case 12:
      return { shape: 'uturn', flip: false };
    case 13:
      return { shape: 'uturn', flip: true };
    case 25:
      return { shape: 'merge', flip: false };
    case 26:
    case 27:
      return { shape: 'roundabout', flip: false };
    // 1-3 exit, 7-8 continue, 17 straight ramp, 22 stay straight, and anything
    // not covered: straight is the reasonable fallback.
    default:
      return { shape: 'straight', flip: false };
  }
}

function arrowSvg(type: number): string {
  const { shape, flip } = arrowFor(type);
  return `<svg class="mv__arrow${flip ? ' mv__arrow--flip' : ''}" viewBox="0 0 32 32" aria-hidden="true">${SHAPES[shape]}</svg>`;
}

export class ManeuverCard {
  readonly el = document.createElement('div');

  private arrow: HTMLElement;
  private dist: HTMLElement;
  private street: HTMLElement;
  private trip: HTMLElement;

  constructor() {
    this.el.className = 'panel mv';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="mv__top">
        <div class="mv__arrowbox" data-arrow></div>
        <div class="mv__text">
          <div class="num mv__dist" data-dist></div>
          <div class="mv__street" data-street></div>
        </div>
      </div>
      <div class="num mv__trip" data-trip></div>`;

    this.arrow = this.el.querySelector('[data-arrow]')!;
    this.dist = this.el.querySelector('[data-dist]')!;
    this.street = this.el.querySelector('[data-street]')!;
    this.trip = this.el.querySelector('[data-trip]')!;
  }

  show(next: Maneuver | null, distanceToNextM: number, remainingM: number, remainingS: number) {
    this.el.classList.remove('panel--bad');

    if (next) {
      this.arrow.innerHTML = arrowSvg(next.type);
      this.dist.textContent = formatDistance(distanceToNextM);
      // Without a street name (ramps, roundabouts) fall back to the full
      // instruction, which Valhalla always provides.
      this.street.textContent = next.streetNames[0] ?? next.instruction;
    } else {
      this.arrow.innerHTML = arrowSvg(4);
      this.dist.textContent = formatDistance(remainingM);
      this.street.textContent = 'Destination';
    }

    this.trip.textContent = `${formatDistance(remainingM)}  ·  ${formatDuration(remainingS)}`;
    this.el.hidden = false;
  }

  /**
   * Without a reroute (arrives in phase 3b), the honest thing is to say we
   * don't know instead of still showing a turn from a route you're no longer
   * following.
   */
  showOffRoute(remainingM: number, remainingS: number) {
    this.el.classList.add('panel--bad');
    this.arrow.innerHTML = arrowSvg(0);
    this.dist.textContent = 'Off route';
    this.street.textContent = 'Return to the marked route';
    this.trip.textContent = `${formatDistance(remainingM)}  ·  ${formatDuration(remainingS)}`;
    this.el.hidden = false;
  }

  /**
   * Recalculating after a deviation. Deliberately distinct from OFF ROUTE:
   * the app is doing something, and just saying "off route" would make it
   * seem like it gave up.
   */
  showRerouting(remainingM: number, remainingS: number) {
    this.el.classList.add('panel--bad');
    this.arrow.innerHTML = arrowSvg(0);
    this.dist.textContent = 'Recalculating';
    this.street.textContent = 'Finding another route';
    this.trip.textContent = `${formatDistance(remainingM)}  ·  ${formatDuration(remainingS)}`;
    this.el.hidden = false;
  }

  /** While there's no GPS fix yet. */
  showWaiting() {
    this.el.classList.remove('panel--bad');
    this.arrow.innerHTML = arrowSvg(0);
    this.dist.textContent = 'Acquiring GPS';
    this.street.textContent = '';
    this.trip.textContent = '';
    this.el.hidden = false;
  }

  showArrived() {
    this.el.classList.remove('panel--bad');
    this.arrow.innerHTML = arrowSvg(4);
    this.dist.textContent = 'You have arrived';
    this.street.textContent = '';
    this.trip.textContent = '';
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }
}
