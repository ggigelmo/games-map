import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { StyleSpecification } from 'maplibre-gl';

import styleJson from '../../style/cyberpunk.json';
import { MapView, type Fix } from './map/map';
import { Hud } from './hud/hud';
import { mountDiagnostics } from './diag/probe';

const style = styleJson as unknown as StyleSpecification;

const mapEl = document.getElementById('map')!;
const ui = document.getElementById('ui')!;

const view = new MapView(mapEl, style);
const hud = new Hud();

// MapLibre emite los fallos de estilo y de teselas por este evento en vez de
// lanzarlos, asi que sin esto un estilo invalido se ve como un mapa negro.
view.map.on('error', (e) => console.error('[map]', e.error?.message ?? e));
if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, {
    __map: view.map,
    __style: style,
  });
}

// mountDiagnostics es tambien quien posee el watchPosition: se monta siempre,
// aunque el panel este oculto, porque el HUD se alimenta de su onFix.
// TODO fase 2: extraer el watcher a services/geolocation.ts cuando el routing
// tambien necesite la posicion.
const diag = mountDiagnostics();

diag.onFix((pos) => {
  const fix: Fix = {
    lng: pos.coords.longitude,
    lat: pos.coords.latitude,
    heading: pos.coords.heading,
    speed: pos.coords.speed,
    accuracy: pos.coords.accuracy,
  };
  view.update(fix);
  hud.update(fix);
});

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

button('Recentrar', false, () => view.recenter());
button('2D / 3D', true, () => view.togglePitch());

diag.el.hidden = true;
const diagBtn = button('Diag', true, () => {
  diag.el.hidden = !diag.el.hidden;
  diagBtn.classList.toggle('btn--ghost', !diag.el.hidden);
});

const spacer = document.createElement('div');
spacer.className = 'spacer';

ui.append(hud.el, spacer, diag.el, controls);

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
// reaplica el estilo sin recargar la pagina ni perder la camara.

if (import.meta.hot) {
  import.meta.hot.accept('../../style/cyberpunk.json', (mod) => {
    if (mod?.default) {
      view.setStyle(mod.default as unknown as StyleSpecification);
      console.info('[style] recargado');
    }
  });
}
