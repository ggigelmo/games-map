import maplibregl, { Map, Marker, type StyleSpecification } from 'maplibre-gl';

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

export interface Fix {
  lng: number;
  lat: number;
  /** grados, o null si el GPS no lo sabe (parado) */
  heading: number | null;
  /** m/s, o null */
  speed: number | null;
  accuracy: number;
}

export class MapView {
  readonly map: Map;
  private marker: Marker | null = null;
  private markerInner = playerMarkerEl();
  /** Si true, la camara persigue al jugador. Se apaga al arrastrar el mapa. */
  following = true;
  private lastHeading = 0;

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

    // Cualquier gesto de arrastre suelta la camara. Es lo que espera el usuario.
    this.map.on('dragstart', () => (this.following = false));
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
      });
    }
  }

  recenter() {
    this.following = true;
    const ll = this.marker?.getLngLat();
    if (ll) this.map.easeTo({ center: ll, bearing: this.lastHeading, zoom: 16.5, duration: 600 });
  }

  togglePitch() {
    const flat = this.map.getPitch() < 20;
    this.map.easeTo({ pitch: flat ? 60 : 0, duration: 500 });
  }
}
