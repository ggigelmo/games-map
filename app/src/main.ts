import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { StyleSpecification } from 'maplibre-gl';

import styleJson from '../../style/cyberpunk.json';
import { MapView } from './map/map';
import { Hud } from './hud/hud';
import { mountDiagnostics } from './diag/probe';
import { GeoWatcher } from './services/geolocation';
import { route as calcularRuta } from './services/routing';
import { StadiaError } from './services/stadia';
import { RouteLayer } from './route/route-layer';
import { RouteCard } from './route/route-card';
import { SearchOverlay } from './search/search-overlay';

/**
 * MapLibre EXIGE que la URL del sprite sea absoluta, al contrario que las de
 * teselas y glifos, que acepta relativas ("Invalid sprite URL, must be
 * absolute"). El estilo guarda una ruta relativa a la raiz para seguir siendo
 * portable entre localhost y Cloudflare, asi que se resuelve aqui contra el
 * origen actual antes de entregarselo al mapa.
 */
function resolveSprite(s: StyleSpecification): StyleSpecification {
  if (typeof s.sprite !== 'string' || /^[a-z]+:/i.test(s.sprite)) return s;
  return { ...s, sprite: new URL(s.sprite, location.origin).href };
}

const style = resolveSprite(styleJson as unknown as StyleSpecification);

const mapEl = document.getElementById('map')!;
const ui = document.getElementById('ui')!;

const view = new MapView(mapEl, style);
const hud = new Hud();
const routeLayer = new RouteLayer(view.map);
const routeCard = new RouteCard();

// MapLibre emite los fallos de estilo y de teselas por este evento en vez de
// lanzarlos, asi que sin esto un estilo invalido se ve como un mapa negro.
view.map.on('error', (e) => console.error('[map]', e.error?.message ?? e));

// ------------------------------------------------------------- posicion

const geo = new GeoWatcher();
const diag = mountDiagnostics(geo);

geo.onFix((fix) => {
  view.update(fix);
  hud.update(fix);
});

geo.start();

if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, {
    __map: view.map,
    __view: view,
    __geo: geo,
    __style: style,
  });
}

// -------------------------------------------------------- busqueda y ruta

const search = new SearchOverlay(() => geo.last);
// Fuera de #ui a proposito: ahi dentro la regla de pointer-events lo mataria.
document.body.appendChild(search.el);

let enCurso: AbortController | null = null;

search.onPick = async (place) => {
  const desde = geo.last;
  if (!desde) return;

  enCurso?.abort();
  const ctrl = new AbortController();
  enCurso = ctrl;

  routeCard.showPending(place.label);

  try {
    const ruta = await calcularRuta(desde, place, ctrl.signal);
    if (ctrl.signal.aborted) return;
    routeLayer.show(ruta);
    routeCard.show(place.label, ruta);
    view.fitRoute(ruta.bounds);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    routeCard.showError(
      place.label,
      err instanceof StadiaError ? err.message : 'No se pudo calcular la ruta',
    );
  }
};

routeCard.onClear = () => {
  enCurso?.abort();
  routeLayer.clear();
  routeCard.hide();
};

// ------------------------------------------------------------------- UI

const controls = document.createElement('div');
controls.className = 'row';

const button = (text: string, ghost: boolean, onClick: () => void) => {
  const b = document.createElement('button');
  b.className = ghost ? 'btn btn--ghost' : 'btn';
  b.textContent = text;
  b.addEventListener('click', onClick);
  controls.appendChild(b);
  return b;
};

// Sin posicion no hay origen para la ruta, asi que el boton nace apagado en vez
// de fallar al pulsarlo.
const searchBtn = button('Buscar', false, () => search.open());
searchBtn.disabled = true;
geo.onFix(() => {
  searchBtn.disabled = false;
});

const recenterBtn = button('Recentrar', true, () => view.recenter());

// Este boton es el UNICO indicador de si la camara te sigue: apagado
// (fantasma) mientras te persigue, encendido en amarillo en cuanto sueltas la
// camara arrastrando. Sin esto el seguimiento se apagaba en silencio y la app
// parecia rota.
const paintFollowState = (following: boolean) =>
  recenterBtn.classList.toggle('btn--ghost', following);

view.onFollowingChange = paintFollowState;
paintFollowState(view.following);

button('2D / 3D', true, () => view.togglePitch());

diag.el.hidden = true;
const diagBtn = button('Diag', true, () => {
  diag.el.hidden = !diag.el.hidden;
  diagBtn.classList.toggle('btn--ghost', !diag.el.hidden);
});

const spacer = document.createElement('div');
spacer.className = 'spacer';

ui.append(hud.el, spacer, diag.el, routeCard.el, controls);

// ------------------------------------------------------------ wake lock
//
// El sistema suelta el bloqueo cuando la pagina pasa a segundo plano, asi que
// hay que volver a pedirlo al regresar. Sin esto la pantalla se apaga en el coche.

type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
};

async function holdScreenAwake() {
  const wl = (navigator as WakeLockNavigator).wakeLock;
  if (!wl) return;
  try {
    await wl.request('screen');
  } catch {
    // Sin wake lock la app sigue funcionando; solo se apaga la pantalla.
  }
}
void holdScreenAwake();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void holdScreenAwake();
});

// --------------------------------------------------- modo laboratorio
//
// ?lab -> controles de escritorio para afinar el estilo: saltos entre ciudades
// y un barrido de zoom, que es como se verifica que ningun ancho de linea se
// descontrola. En el movil no molesta porque no se activa.

if (new URLSearchParams(location.search).has('lab')) {
  const PLACES: [string, number, number, number][] = [
    ['Madrid', -3.7038, 40.4168, 15],
    ['Barcelona', 2.1734, 41.3851, 15],
    ['Valencia', -0.3763, 39.4699, 15],
    ['Bilbao', -2.935, 43.263, 15],
    ['Hong Kong', 114.1694, 22.3193, 15],
    ['Tokio', 139.6917, 35.6895, 15],
    ['Manhattan', -73.9857, 40.7484, 15],
  ];

  const lab = document.createElement('div');
  lab.className = 'panel row';
  lab.style.marginTop = '10px';

  for (const [name, lng, lat, zoom] of PLACES) {
    const b = document.createElement('button');
    b.className = 'btn btn--ghost';
    b.textContent = name;
    b.addEventListener('click', () => {
      view.following = false;
      view.map.jumpTo({ center: [lng, lat], zoom, pitch: 55 });
    });
    lab.appendChild(b);
  }

  const sweep = document.createElement('button');
  sweep.className = 'btn';
  sweep.textContent = 'Barrido 8 → 18';
  sweep.addEventListener('click', () => {
    view.following = false;
    view.map.jumpTo({ zoom: 8 });
    view.map.easeTo({ zoom: 18, duration: 14_000, easing: (t) => t });
  });
  lab.appendChild(sweep);

  const readout = document.createElement('span');
  readout.className = 'num';
  readout.style.alignSelf = 'center';
  const sync = () =>
    (readout.textContent =
      `z${view.map.getZoom().toFixed(2)}  ` +
      `p${view.map.getPitch().toFixed(0)}  ` +
      `b${view.map.getBearing().toFixed(0)}`);
  view.map.on('move', sync);
  sync();
  lab.appendChild(readout);

  ui.appendChild(lab);
}

// -------------------------------------------------------------- HMR
//
// Editar style/build.mjs -> el plugin de Vite regenera cyberpunk.json -> esto
// reaplica el estilo sin recargar la pagina ni perder la camara. RouteLayer se
// repinta sola al oir 'style.load'.

if (import.meta.hot) {
  import.meta.hot.accept('../../style/cyberpunk.json', (mod) => {
    if (mod?.default) {
      view.setStyle(resolveSprite(mod.default as unknown as StyleSpecification));
      console.info('[style] recargado');
    }
  });
}
