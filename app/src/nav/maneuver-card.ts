import { formatDistance, formatDuration } from '../services/geo-math';
import type { Maneuver } from '../services/routing';

/**
 * Tarjeta del siguiente giro.
 *
 * Las flechas se dibujan como SVG en linea, no como sprites: van en el HUD, no
 * en el mapa, asi que no hacen falta glifos SDF ni hojas de sprites. Usan
 * `currentColor`, de modo que el CSS decide el color.
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
 * Punta de flecha canonica: apunta ARRIBA y esta centrada en el origen.
 *
 * Se coloca y se gira con un `transform`, en vez de calcular los tres vertices
 * de cada punta con trigonometria. El primer intento fue asi y salieron tres
 * flechas torcidas (giro brusco, rotonda e incorporacion): con la punta
 * canonica, la orientacion es un numero de grados y no puede estar mal.
 */
const HEAD = 'M0 -7 L5.5 5 L-5.5 5 Z';

/** @param deg 0 arriba, 90 derecha, 180 abajo (sentido horario) */
const head = (x: number, y: number, deg: number) =>
  `<path d="${HEAD}" class="fill" transform="translate(${x} ${y}) rotate(${deg})" />`;

/**
 * Solo se dibuja la variante DERECHA de cada forma. Las de izquierda son la
 * misma con un espejo horizontal: menos trazados y simetria garantizada.
 */
const SHAPES: Record<Shape, string> = {
  straight: `<path d="M16 29V13" />${head(16, 9, 0)}`,

  slight: `<path d="M14 29V20 L20 12" />${head(22.5, 8.5, 45)}`,

  turn: `<path d="M12 29V17 Q12 14 15 14 H19" />${head(23, 14, 90)}`,

  // Giro cerrado: la punta mira hacia abajo-derecha, no solo a la derecha.
  sharp: `<path d="M12 29V19 Q12 15 16 15.5 L18.5 16.5" />${head(22, 20, 135)}`,

  uturn: `<path d="M11 29V17 Q11 10 18 10 Q25 10 25 17V19" />${head(25, 23, 180)}`,

  // Entras por abajo, das la vuelta y sales hacia arriba a la derecha. Con la
  // salida en horizontal se leia como una piruleta, no como una rotonda.
  roundabout:
    `<circle cx="15" cy="14.5" r="6" />` +
    `<path d="M15 29V20.5" />` +
    `<path d="M19.3 10.2 L20.8 8.7" />` +
    head(23, 6.5, 45),

  // Via principal recta y una secundaria que se incorpora desde la derecha.
  merge: `<path d="M14 29V13" /><path d="M24 27 Q24 19 15.5 16" />${head(14, 9, 0)}`,

  destination:
    `<path d="M16 4 C10.5 4 6 8.5 6 14 C6 21 16 29 16 29 C16 29 26 21 26 14 C26 8.5 21.5 4 16 4 Z" class="fill" />` +
    `<circle cx="16" cy="13.5" r="3.6" class="hole" />`,
};

/**
 * Tipos de maniobra de Valhalla. Es un enum numerico y no todos merecen una
 * flecha propia: los enlaces y los "mantengase a la derecha" se dibujan como
 * un giro leve, que es lo que significan al volante.
 */
function arrowFor(type: number): { shape: Shape; flip: boolean } {
  switch (type) {
    case 4:
    case 5:
    case 6:
      return { shape: 'destination', flip: false };
    case 9: // leve derecha
    case 18: // enlace derecha
    case 20: // salida derecha
    case 23: // mantengase a la derecha
      return { shape: 'slight', flip: false };
    case 16: // leve izquierda
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
    // 1-3 salida, 7-8 continuar, 17 enlace recto, 22 seguir recto, y lo que
    // no este contemplado: recto es el valor de reserva razonable.
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
      // Sin nombre de calle (enlaces, rotondas) se cae a la instruccion entera,
      // que Valhalla siempre da.
      this.street.textContent = next.streetNames[0] ?? next.instruction;
    } else {
      this.arrow.innerHTML = arrowSvg(4);
      this.dist.textContent = formatDistance(remainingM);
      this.street.textContent = 'Destino';
    }

    this.trip.textContent = `${formatDistance(remainingM)}  ·  ${formatDuration(remainingS)}`;
    this.el.hidden = false;
  }

  /**
   * Sin recalculo (llega en la fase 3b), lo honesto es decir que no se sabe en
   * vez de seguir mostrando un giro de una ruta que ya no sigues.
   */
  showOffRoute(remainingM: number, remainingS: number) {
    this.el.classList.add('panel--bad');
    this.arrow.innerHTML = arrowSvg(0);
    this.dist.textContent = 'Fuera de ruta';
    this.street.textContent = 'Vuelve a la ruta marcada';
    this.trip.textContent = `${formatDistance(remainingM)}  ·  ${formatDuration(remainingS)}`;
    this.el.hidden = false;
  }

  /**
   * Recalculando tras un desvio. Se distingue de FUERA DE RUTA a proposito: la
   * app esta haciendo algo, y decir solo "fuera de ruta" pareceria que se ha
   * rendido.
   */
  showRerouting(remainingM: number, remainingS: number) {
    this.el.classList.add('panel--bad');
    this.arrow.innerHTML = arrowSvg(0);
    this.dist.textContent = 'Recalculando';
    this.street.textContent = 'Buscando otra ruta';
    this.trip.textContent = `${formatDistance(remainingM)}  ·  ${formatDuration(remainingS)}`;
    this.el.hidden = false;
  }

  /** Mientras no hay lectura de GPS todavia. */
  showWaiting() {
    this.el.classList.remove('panel--bad');
    this.arrow.innerHTML = arrowSvg(0);
    this.dist.textContent = 'Buscando GPS';
    this.street.textContent = '';
    this.trip.textContent = '';
    this.el.hidden = false;
  }

  showArrived() {
    this.el.classList.remove('panel--bad');
    this.arrow.innerHTML = arrowSvg(4);
    this.dist.textContent = 'Has llegado';
    this.street.textContent = '';
    this.trip.textContent = '';
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }
}
