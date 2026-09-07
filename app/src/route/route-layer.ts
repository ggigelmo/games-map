import type { Map } from 'maplibre-gl';

import type { Route } from '../services/routing';

const SOURCE = 'route';

/**
 * Magenta: el unico color vivo que el basemap no usa. El amarillo esta cogido
 * por las autovias y el cian por el resto de vias, asi que una ruta en
 * cualquiera de los dos se perderia encima de ellas.
 */
const MAGENTA = '#ff003c';
const CORE = '#ff8fa6';

/** Debajo de las etiquetas, para no taparlas con la linea. */
const BEFORE = 'road-label';

const width = (mul: number) => [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  10,
  2 * mul,
  14,
  5 * mul,
  18,
  11 * mul,
  20,
  20 * mul,
];

/**
 * Dibuja la ruta con el mismo truco de tres capas que el estilo del mapa:
 * halo ancho difuminado, cuerpo, y filamento fino aclarado. Asi la ruta
 * pertenece visualmente al mismo mundo que las calles.
 */
export class RouteLayer {
  private current: Route | null = null;

  constructor(private readonly map: Map) {
    // `setStyle` borra fuentes y capas anadidas a mano. Pasa en cada recarga en
    // caliente del estilo durante el desarrollo. En vez de que main.ts tenga
    // que acordarse de repintar, la capa se recompone sola.
    this.map.on('style.load', () => this.render());
  }

  show(route: Route) {
    this.current = route;
    this.render();
  }

  clear() {
    this.current = null;
    this.teardown();
  }

  get route(): Route | null {
    return this.current;
  }

  private teardown() {
    for (const id of ['route-core', 'route-mid', 'route-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource(SOURCE)) this.map.removeSource(SOURCE);
  }

  private render() {
    // Durante un cambio de estilo el mapa rechaza que le anadan capas.
    if (!this.map.isStyleLoaded()) return;

    this.teardown();
    if (!this.current) return;

    this.map.addSource(SOURCE, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: this.current.coordinates },
      },
    });

    const before = this.map.getLayer(BEFORE) ? BEFORE : undefined;
    const base = {
      type: 'line' as const,
      source: SOURCE,
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
    };

    this.map.addLayer(
      {
        ...base,
        id: 'route-glow',
        paint: {
          'line-color': MAGENTA,
          'line-width': width(3.4) as never,
          'line-blur': width(3) as never,
          'line-opacity': 0.5,
        },
      },
      before,
    );

    this.map.addLayer(
      {
        ...base,
        id: 'route-mid',
        paint: {
          'line-color': MAGENTA,
          'line-width': width(1.7) as never,
          'line-blur': width(0.5) as never,
          'line-opacity': 0.75,
        },
      },
      before,
    );

    this.map.addLayer(
      {
        ...base,
        id: 'route-core',
        paint: { 'line-color': CORE, 'line-width': width(1) as never },
      },
      before,
    );
  }
}
