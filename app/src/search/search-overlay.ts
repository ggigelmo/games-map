import { formatDistance, type Point } from '../services/geo-math';
import { autocomplete, MIN_QUERY_LENGTH, type Place } from '../services/geocoding';
import { StadiaError } from '../services/stadia';

/** Cuanto esperar tras la ultima tecla antes de preguntar al servidor. */
const DEBOUNCE_MS = 300;

/**
 * Buscador a pantalla completa.
 *
 * A pantalla completa y no una barra fija porque en un movil el HUD ya va justo
 * de espacio, y la lista de resultados necesita sitio para leerse de un vistazo
 * mientras conduces.
 */
export class SearchOverlay {
  readonly el = document.createElement('div');
  onPick: ((place: Place) => void) | null = null;

  private input: HTMLInputElement;
  private list: HTMLElement;
  private status: HTMLElement;
  private timer: number | null = null;
  private inFlight: AbortController | null = null;

  /** @param getNear posicion actual, para sesgar los resultados */
  constructor(private readonly getNear: () => Point | null) {
    this.el.className = 'search';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="search__bar panel">
        <input class="search__input" type="search" enterkeyhint="search"
               autocomplete="off" autocorrect="off" spellcheck="false"
               placeholder="¿A dónde vamos?" aria-label="Buscar destino" />
        <button class="btn btn--ghost search__close">Cerrar</button>
      </div>
      <div class="search__status label" data-status></div>
      <ul class="search__list" data-list></ul>`;

    this.input = this.el.querySelector('.search__input')!;
    this.list = this.el.querySelector('[data-list]')!;
    this.status = this.el.querySelector('[data-status]')!;

    this.el.querySelector('.search__close')!.addEventListener('click', () => this.close());
    this.input.addEventListener('input', () => this.schedule());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  open() {
    this.el.hidden = false;
    // Abrir siempre viene de pulsar un boton, o sea de un gesto del usuario,
    // que es lo que iOS exige para que focus() saque el teclado.
    this.input.focus();
    this.input.select();
  }

  close() {
    this.cancelPending();
    this.el.hidden = true;
    this.input.blur();
  }

  private cancelPending() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.inFlight?.abort();
    this.inFlight = null;
  }

  private schedule() {
    this.cancelPending();
    const text = this.input.value.trim();

    if (text.length < MIN_QUERY_LENGTH) {
      this.list.replaceChildren();
      this.status.textContent = text.length ? `Escribe al menos ${MIN_QUERY_LENGTH} letras` : '';
      return;
    }

    this.status.textContent = 'Buscando…';
    this.timer = window.setTimeout(() => void this.run(text), DEBOUNCE_MS);
  }

  private async run(text: string) {
    // Cancelar la anterior no es optimizacion: sin esto las respuestas llegan
    // desordenadas y la lista parpadea con resultados de consultas ya viejas.
    const ctrl = new AbortController();
    this.inFlight = ctrl;

    try {
      const places = await autocomplete(text, this.getNear(), ctrl.signal);
      if (ctrl.signal.aborted) return;
      this.paint(places);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      this.list.replaceChildren();
      this.status.textContent =
        err instanceof StadiaError ? err.message.toUpperCase() : 'ERROR DE BÚSQUEDA';
    }
  }

  private paint(places: Place[]) {
    this.list.replaceChildren();

    if (!places.length) {
      this.status.textContent = 'Sin resultados';
      return;
    }
    this.status.textContent = '';

    for (const place of places) {
      const li = document.createElement('li');
      li.className = 'search__item';

      const name = document.createElement('span');
      name.className = 'search__label';
      name.textContent = place.label;
      li.appendChild(name);

      if (place.distanceM !== null) {
        const dist = document.createElement('span');
        dist.className = 'num search__dist';
        dist.textContent = formatDistance(place.distanceM);
        li.appendChild(dist);
      }

      li.addEventListener('click', () => {
        this.close();
        this.onPick?.(place);
      });
      this.list.appendChild(li);
    }
  }
}
