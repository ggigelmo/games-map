import maplibregl, { Map, Marker, type LngLat, type StyleSpecification } from 'maplibre-gl';

import type { Fix } from '../services/geolocation';

/**
 * Cuantos pixeles tiene que panear el mapa para considerarlo un arrastre
 * deliberado y soltar la camara. Un pulgar apoyado se mueve unos pocos; un
 * gesto de verdad se pasa de esto de sobra.
 */
const PAN_INTENT_PX = 32;

/** Chevron del jugador: cian con halo, apuntando al rumbo. */
function playerMarkerEl(): HTMLElement {
  const el = document.createElement('div');
  el.style.willChange = 'transform';
  el.innerHTML = `
    <svg width="46" height="46" viewBox="0 0 46 46" style="overflow:visible">
      <defs>
        <filter id="pglow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="23" cy="23" r="17" fill="#00f0ff" opacity="0.07" />
      <g filter="url(#pglow)">
        <path d="M23 6 L34 34 L23 27 L12 34 Z"
              fill="#00f0ff" stroke="#d6feff" stroke-width="1.3"
              stroke-linejoin="round" />
      </g>
    </svg>`;
  return el;
}

// `Fix` lo define quien lo produce: services/geolocation.ts. Se reexporta para
// no obligar a los consumidores del mapa a saber de donde sale.
export type { Fix } from '../services/geolocation';

export class MapView {
  readonly map: Map;
  private marker: Marker | null = null;
  private markerInner = playerMarkerEl();
  private lastHeading = 0;
  private _following = true;

  /**
   * Avisa de los cambios de `following` para que la UI pueda reflejarlos.
   *
   * Sin esto el seguimiento se apagaba en silencio y la app parecia rota: el
   * mapa dejaba de seguirte sin que nada en pantalla dijera por que.
   */
  onFollowingChange: ((following: boolean) => void) | null = null;

  /** Si true, la camara persigue al jugador. */
  get following(): boolean {
    return this._following;
  }

  set following(value: boolean) {
    if (this._following === value) return;
    this._following = value;
    this.onFollowingChange?.(value);
  }

  constructor(container: HTMLElement, style: StyleSpecification) {
    this.map = new maplibregl.Map({
      container,
      style,
      center: [-3.7038, 40.4168], // Madrid, hasta que llegue el primer fix
      zoom: 15,
      pitch: 55,
      bearing: 0,
      attributionControl: { compact: true },
      // Sin estos dos el mapa se siente como una web, no como un juego.
      dragRotate: true,
      pitchWithRotate: true,
    });

    this.map.touchZoomRotate.enableRotation();

    // MapLibre mide el contenedor UNA vez, al construirse. Si en ese momento
    // mide 0 (pestana en segundo plano, arranque de una PWA, rotacion de
    // pantalla, teclado del movil), el canvas se queda en su tamano de
    // emergencia y el mapa no vuelve a pintar nunca. Hay que reavisarle.
    new ResizeObserver(() => this.map.resize()).observe(container);

    this.watchForIntentionalPan();
  }

  /**
   * Suelta la camara solo ante un arrastre DELIBERADO.
   *
   * Antes bastaba con el evento `dragstart`, que salta al primer pixel: un
   * pulgar apoyado en la pantalla apagaba el seguimiento para el resto de la
   * sesion, y nada lo indicaba. Ahora se mide cuanto ha paneado el mapa de
   * verdad y solo se suelta al pasar del umbral; un roce no cuenta.
   *
   * El zoom con dos dedos NO lo suelta (dispara `zoomstart`, no `dragstart`),
   * asi que puedes acercarte y alejarte sin perder el seguimiento.
   */
  private watchForIntentionalPan() {
    let anchor: LngLat | null = null;

    this.map.on('dragstart', () => {
      anchor = this.map.getCenter();
    });

    this.map.on('drag', () => {
      if (!this.following || !anchor) return;
      // project() del centro actual devuelve siempre el centro del lienzo, asi
      // que esta distancia es literalmente cuantos pixeles se ha movido el mapa.
      const from = this.map.project(anchor);
      const to = this.map.project(this.map.getCenter());
      if (Math.hypot(from.x - to.x, from.y - to.y) > PAN_INTENT_PX) {
        this.following = false;
      }
    });

    this.map.on('dragend', () => {
      anchor = null;
    });
  }

  /** Aplica un estilo nuevo conservando la camara. Lo usa el HMR. */
  setStyle(style: StyleSpecification) {
    this.map.setStyle(style, { diff: true });
  }

  update(fix: Fix) {
    const lngLat: [number, number] = [fix.lng, fix.lat];

    if (!this.marker) {
      this.marker = new maplibregl.Marker({ element: this.markerInner, rotationAlignment: 'map' })
        .setLngLat(lngLat)
        .addTo(this.map);
      // Primer fix: saltar sin animar, para no ver un vuelo desde Madrid.
      this.map.jumpTo({ center: lngLat, zoom: 16.5 });
    } else {
      this.marker.setLngLat(lngLat);
    }

    // coords.heading es null cuando estas parado; conservamos el ultimo bueno.
    if (fix.heading !== null && !Number.isNaN(fix.heading)) this.lastHeading = fix.heading;
    this.marker.setRotation(this.lastHeading);

    if (this.following) {
      this.map.easeTo({
        center: lngLat,
        bearing: this.lastHeading,
        duration: 900,
        easing: (t) => t * (2 - t),
        // En una app de navegacion el movimiento de camara no es decorativo:
        // sin esto, "Reducir movimiento" de iOS lo descartaria.
        essential: true,
      });
    }
  }

  recenter() {
    this.following = true;
    const ll = this.marker?.getLngLat();
    if (ll) {
      this.map.easeTo({
        center: ll,
        bearing: this.lastHeading,
        zoom: 16.5,
        duration: 600,
        essential: true,
      });
    }
  }

  /**
   * Encuadra la ruta completa. Suelta la camara a proposito: quieres ver por
   * donde va antes de arrancar, y RECENTRAR la devuelve a seguirte.
   *
   * El relleno inferior es mayor que el superior porque abajo estan la tarjeta
   * de ruta y los botones; sin eso la ruta queda escondida detras del HUD.
   */
  fitRoute(bounds: [[number, number], [number, number]]) {
    this.following = false;
    this.map.fitBounds(bounds, {
      padding: { top: 110, bottom: 240, left: 50, right: 50 },
      pitch: 0,
      bearing: 0,
      duration: 900,
      essential: true,
    });
  }

  togglePitch() {
    const flat = this.map.getPitch() < 20;
    this.map.easeTo({ pitch: flat ? 60 : 0, duration: 500, essential: true });
  }
}
