import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { StyleSpecification } from 'maplibre-gl';

import styleJson from '../../style/cyberpunk.json';
import { MapView } from './map/map';
import { Hud } from './hud/hud';
import { mountDiagnostics } from './diag/probe';
import { Compass } from './services/compass';
import { GeoWatcher, type Fix } from './services/geolocation';
import { KeepAwake } from './services/keep-awake';
import { route as calculateRoute } from './services/routing';
import { StadiaError } from './services/stadia';
import { ManeuverCard } from './nav/maneuver-card';
import { NavSession, type Destination, type NavPhase } from './nav/session';
import { RouteLayer } from './route/route-layer';
import { RouteCard } from './route/route-card';
import { SearchOverlay } from './search/search-overlay';
import { VoiceGuide } from './services/voice';

/**
 * MapLibre REQUIRES the sprite URL to be absolute, unlike tile and glyph
 * URLs, which accept relative ones ("Invalid sprite URL, must be absolute").
 * The style keeps a root-relative path to stay portable between localhost
 * and Cloudflare, so it's resolved here against the current origin before
 * handing it to the map.
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
const maneuverCard = new ManeuverCard();
const nav = new NavSession();
const voice = new VoiceGuide();

// MapLibre emits style and tile failures through this event instead of
// throwing, so without this an invalid style just looks like a black map.
view.map.on('error', (e) => console.error('[map]', e.error?.message ?? e));

// ------------------------------------------------------------- position

const geo = new GeoWatcher();
const compass = new Compass();
const keepAwake = new KeepAwake();
const diag = mountDiagnostics(geo, compass, keepAwake);

geo.onFix((fix) => {
  view.update(fix);
  hud.update(fix);
  nav.consume(fix);
});

// The map decides whether to listen: moving, GPS wins; stopped, the compass wins.
compass.onHeading((deg) => view.setCompassHeading(deg));

geo.start();

// On Android and desktop the orientation event arrives without asking for
// permission, so the compass starts on its own. On iOS it needs a user
// gesture, and that's what the DIAG panel button is for.
if (compass.supported && !compass.needsPermission) void compass.enable();

// The screen, kept on while the app is in the foreground. Retried on
// pressing GO: being a real user gesture, that's when iOS is most likely to
// grant it, so if this first attempt fails there will be another chance
// right when it's actually needed.
void keepAwake.enable();

if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, {
    __map: view.map,
    __view: view,
    __geo: geo,
    __nav: nav,
    __style: style,
  });
}

// -------------------------------------------------------- search and route

const search = new SearchOverlay(() => geo.last);
// Outside #ui on purpose: in there the pointer-events rule would kill it.
document.body.appendChild(search.el);

let inFlight: AbortController | null = null;
/** Reroute request in flight. Declared here because onClear uses it. */
let reroute: AbortController | null = null;

search.onPick = async (place) => {
  const from = geo.last;
  if (!from) return;

  inFlight?.abort();
  const ctrl = new AbortController();
  inFlight = ctrl;

  routeCard.showPending(place.label);

  try {
    const route = await calculateRoute(from, place, ctrl.signal);
    if (ctrl.signal.aborted) return;
    routeLayer.show(route);
    // Preview: frame the whole trip to decide. The driving camera is a
    // different one, and it kicks in when GO is pressed.
    nav.preview(route, { label: place.label, lng: place.lng, lat: place.lat });
    routeCard.show(place.label, route);
    view.fitRoute(route.bounds);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    routeCard.showError(
      place.label,
      err instanceof StadiaError ? err.message : 'Could not calculate the route',
    );
  }
};

routeCard.onGo = () => {
  nav.start();
  view.startNavigation();
  // Second attempt at the screen lock, from a real gesture.
  void keepAwake.enable();

  // The session's first speak() has to come from a real user gesture or iOS
  // discards it (docs/findings.md §6): this button is that gesture. It's
  // also the ONLY maneuver that session.ts's automatic announcement never
  // gets to announce: the departure one (index 0) is already "behind" you
  // as soon as there's a first GPS fix.
  const departure = nav.route?.maneuvers[0];
  if (departure) voice.speak(departure.verbal ?? departure.instruction);
};

routeCard.onClear = () => {
  inFlight?.abort();
  reroute?.abort();
  nav.stop();
  voice.cancel();
};

/**
 * Automatic reroute. The session decides WHEN it's needed (off route, no
 * other request in flight, and at least 15 s between attempts); this only
 * requests the route, which is where the dealings with the network already live.
 */
nav.onNeedsReroute = async (from: Fix, to: Destination) => {
  reroute?.abort();
  const ctrl = new AbortController();
  reroute = ctrl;

  try {
    const newRoute = await calculateRoute(from, to, ctrl.signal);
    if (ctrl.signal.aborted) return;
    routeLayer.show(newRoute);
    nav.replaceRoute(newRoute);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    // Without coverage the old route stays drawn and the card goes back to
    // OFF ROUTE. The session will retry after the interval.
    nav.rerouteFailed();
  }
};

nav.onAnnounce = (text) => voice.speak(text);

nav.onUpdate = ({ progress, offRoute, rerouting }) => {
  if (rerouting) {
    maneuverCard.showRerouting(progress.remainingM, progress.remainingS);
  } else if (offRoute) {
    maneuverCard.showOffRoute(progress.remainingM, progress.remainingS);
  } else {
    maneuverCard.show(
      progress.next,
      progress.distanceToNextM,
      progress.remainingM,
      progress.remainingS,
    );
  }
};

nav.onArrived = () => {
  // `stop()` has already cleared the UI; this stays on top for a while.
  maneuverCard.showArrived();
  window.setTimeout(() => maneuverCard.hide(), 8_000);
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

// Without a position there's no origin for the route, so the button starts
// disabled instead of failing when pressed.
const searchBtn = button('Search', false, () => search.open());
searchBtn.disabled = true;
geo.onFix(() => {
  searchBtn.disabled = false;
});

const stopBtn = button('Stop', false, () => nav.stop());
stopBtn.classList.add('btn--stop');

const recenterBtn = button('Recenter', true, () => view.recenter());

// This button is the ONLY indicator of whether the camera is following you:
// off (ghosted) while it tracks you, lit up amber as soon as you let go of
// the camera by dragging. Without this, following would turn off silently
// and the app would look broken.
const paintFollowState = (following: boolean) =>
  recenterBtn.classList.toggle('btn--ghost', following);

view.onFollowingChange = paintFollowState;
paintFollowState(view.following);

const pitchBtn = button('2D / 3D', true, () => view.togglePitch());

diag.el.hidden = true;
const diagBtn = button('Diag', true, () => {
  diag.el.hidden = !diag.el.hidden;
  diagBtn.classList.toggle('btn--ghost', !diag.el.hidden);
});

const spacer = document.createElement('div');
spacer.className = 'spacer';

ui.append(hud.el, spacer, diag.el, maneuverCard.el, routeCard.el, controls);

// --------------------------------------------------- state machine
//
// Each phase decides what's shown. Keeping it in one place avoids the UI
// ending up in impossible states, like STOP showing with no route.

let previousPhase: NavPhase = 'idle';

function paintPhase(phase: NavPhase) {
  const navigating = phase === 'navigating';

  searchBtn.hidden = navigating;
  stopBtn.hidden = !navigating;
  pitchBtn.hidden = navigating; // while navigating the session drives the camera

  if (phase === 'idle') {
    routeLayer.clear();
    routeCard.hide();
    maneuverCard.hide();
    // Only when LEAVING navigation, to avoid animating the camera on app startup.
    if (previousPhase === 'navigating') view.stopNavigation();
  } else if (phase === 'preview') {
    maneuverCard.hide();
  } else {
    routeCard.hide();
    // Until the first fix there's no progress to show.
    maneuverCard.showWaiting();
  }

  previousPhase = phase;
}

nav.onPhase = paintPhase;
paintPhase('idle');

// --------------------------------------------------- lab mode
//
// ?lab -> desktop controls for tuning the style: jumps between cities and a
// zoom sweep, which is how it's verified that no line width goes out of
// control. It's not intrusive on mobile because it never gets enabled.

if (new URLSearchParams(location.search).has('lab')) {
  const PLACES: [string, number, number, number][] = [
    ['Madrid', -3.7038, 40.4168, 15],
    ['Barcelona', 2.1734, 41.3851, 15],
    ['Valencia', -0.3763, 39.4699, 15],
    ['Bilbao', -2.935, 43.263, 15],
    ['Hong Kong', 114.1694, 22.3193, 15],
    ['Tokyo', 139.6917, 35.6895, 15],
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
  sweep.textContent = 'Sweep 8 → 18';
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
// Editing style/build.mjs -> the Vite plugin regenerates cyberpunk.json ->
// this reapplies the style without reloading the page or losing the camera.
// RouteLayer repaints itself on hearing 'style.load'.

if (import.meta.hot) {
  import.meta.hot.accept('../../style/cyberpunk.json', (mod) => {
    if (mod?.default) {
      view.setStyle(resolveSprite(mod.default as unknown as StyleSpecification));
      console.info('[style] reloaded');
    }
  });
}
