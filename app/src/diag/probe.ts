/**
 * Panel de diagnostico. Existe para responder empiricamente a una pregunta:
 * ¿aguanta una PWA en iOS lo que necesita una app de navegacion?
 *
 * Los tres riesgos conocidos que mide:
 *
 *  1. "Ubicacion precisa" desactivada para Safari -> watchPosition devuelve
 *     precision de 3-9 km y solo refresca cada ~15 min. Inservible, y no da
 *     ningun error: simplemente miente. Se detecta por accuracy + intervalo.
 *  2. Bug historico en modo standalone: el dialogo de permiso de ubicacion no
 *     aparece y la llamada NO hace timeout nunca. Se detecta con un temporizador
 *     propio, porque el de la API no salta.
 *  3. Screen Wake Lock estuvo roto en PWAs instaladas hasta iOS 18.4. Sin el,
 *     la pantalla se apaga a mitad de trayecto.
 */

import type { Compass } from '../services/compass';
import type { GeoWatcher } from '../services/geolocation';

type Verdict = 'ok' | 'warn' | 'bad' | 'pending';

interface Row {
  label: string;
  value: string;
  verdict: Verdict;
}

export interface Diagnostics {
  el: HTMLElement;
}

/**
 * @param geo     dueno del watchPosition; este panel solo mide lo que sale de el
 * @param compass brujula; el permiso se concede desde aqui, porque iOS exige
 *                que la peticion salga de un gesto del usuario
 */
export function mountDiagnostics(geo: GeoWatcher, compass: Compass): Diagnostics {
  const el = document.createElement('section');
  el.className = 'panel';
  el.id = 'diag';

  const rows = new Map<string, Row>();

  // Se declara aqui arriba porque render() lo reengancha en cada pintada, y
  // render() ya corre desde el primer set(), antes de la seccion de voz.
  const botones = document.createElement('div');
  botones.className = 'row';
  botones.style.marginTop = '10px';

  const voiceBtn = document.createElement('button');
  voiceBtn.className = 'btn btn--ghost';
  voiceBtn.textContent = 'Probar voz';

  const compassBtn = document.createElement('button');
  compassBtn.className = 'btn btn--ghost';
  compassBtn.textContent = 'Activar brujula';

  botones.append(voiceBtn, compassBtn);

  const set = (key: string, label: string, value: string, verdict: Verdict) => {
    rows.set(key, { label, value, verdict });
    render();
  };

  function render() {
    const items = [...rows.values()]
      .map(
        (r) =>
          `<dt>${r.label}</dt><dd class="${r.verdict === 'pending' ? '' : r.verdict}">${r.value}</dd>`,
      )
      .join('');
    el.innerHTML = `<h2>Diagnostico del dispositivo</h2><dl>${items}</dl>`;
    el.appendChild(botones);
  }

  // ------------------------------------------------------- entorno

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari en iOS expone esto en vez de display-mode durante anos.
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  set('mode', 'Modo', standalone ? 'STANDALONE' : 'NAVEGADOR', standalone ? 'ok' : 'warn');

  const ua = navigator.userAgent;
  const iosMatch = /OS (\d+)[._](\d+)/.exec(ua);
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
  if (isIOS && iosMatch) {
    const major = Number(iosMatch[1]);
    const minor = Number(iosMatch[2]);
    const wakeLockFixed = major > 18 || (major === 18 && minor >= 4);
    set(
      'ios',
      'iOS',
      `${major}.${minor}`,
      wakeLockFixed ? 'ok' : 'warn',
    );
  } else {
    set('ios', 'Plataforma', isIOS ? 'iOS (version ?)' : 'no iOS', 'warn');
  }

  set(
    'secure',
    'Contexto seguro',
    window.isSecureContext ? 'HTTPS' : 'INSEGURO',
    window.isSecureContext ? 'ok' : 'bad',
  );

  // ---------------------------------------------------- geolocalizacion
  //
  // El watcher ya no vive aqui: lo posee services/geolocation.ts, porque el
  // routing tambien necesita la posicion y no puede depender de un panel de
  // depuracion. Esto solo mide lo que sale de el.

  set('geo', 'GPS: primer fix', 'esperando...', 'pending');
  set('acc', 'Precision', '-', 'pending');
  set('rate', 'Intervalo entre fixes', '-', 'pending');

  let fixes = 0;
  let lastFixAt = 0;
  const intervals: number[] = [];

  geo.onFix((fix) => {
    fixes += 1;
    if (lastFixAt) intervals.push(fix.at - lastFixAt);
    lastFixAt = fix.at;

    if (fixes === 1) {
      set('geo', 'GPS: primer fix', `${Math.round(fix.at - geo.startedAt)} ms`, 'ok');
    }

    const acc = fix.accuracy;
    // >500 m es la firma de "Ubicacion precisa" desactivada para Safari.
    set(
      'acc',
      'Precision',
      `${acc < 1000 ? acc.toFixed(0) + ' m' : (acc / 1000).toFixed(1) + ' km'}  (${fixes} fix)`,
      acc <= 30 ? 'ok' : acc <= 200 ? 'warn' : 'bad',
    );

    if (intervals.length) {
      const med = [...intervals].sort((a, b) => a - b)[intervals.length >> 1]!;
      set(
        'rate',
        'Intervalo entre fixes',
        med < 1000 ? `${med.toFixed(0)} ms` : `${(med / 1000).toFixed(1)} s`,
        med <= 5000 ? 'ok' : med <= 30_000 ? 'warn' : 'bad',
      );
    }
  });

  geo.onFailure((f) => {
    const texto =
      f.kind === 'unsupported'
        ? 'NO SOPORTADO'
        : f.kind === 'silent'
          ? 'SIN RESPUESTA'
          : f.message;
    set('geo', 'GPS: primer fix', texto, 'bad');
    if (f.kind === 'silent') set('acc', 'Precision', 'permiso nunca resuelto', 'bad');
  });

  // -------------------------------------------------------- wake lock

  type WakeLockNavigator = Navigator & {
    wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
  };
  const wl = (navigator as WakeLockNavigator).wakeLock;

  if (!wl) {
    set('wake', 'Wake Lock', 'NO SOPORTADO', 'bad');
  } else {
    set('wake', 'Wake Lock', 'solicitando...', 'pending');
    wl.request('screen')
      .then(() => set('wake', 'Wake Lock', 'ACTIVO', 'ok'))
      .catch((e: Error) => set('wake', 'Wake Lock', `FALLO: ${e.name}`, 'bad'));
  }

  // ------------------------------------------------------------- voz

  if (!('speechSynthesis' in window)) {
    set('tts', 'Sintesis de voz', 'NO SOPORTADO', 'bad');
    voiceBtn.disabled = true;
  } else {
    const countVoices = () => {
      const all = speechSynthesis.getVoices();
      const es = all.filter((v) => v.lang.startsWith('es'));
      set(
        'tts',
        'Voces (es / total)',
        `${es.length} / ${all.length}`,
        es.length > 0 ? 'ok' : all.length > 0 ? 'warn' : 'pending',
      );
    };
    countVoices();
    // En iOS la lista llega asincrona, a veces solo tras el primer speak().
    speechSynthesis.addEventListener('voiceschanged', countVoices);

    // iOS exige que el PRIMER speak() venga de un gesto del usuario.
    // Por eso esto es un boton y no una prueba automatica.
    voiceBtn.addEventListener('click', () => {
      const u = new SpeechSynthesisUtterance('En doscientos metros, gire a la derecha.');
      u.lang = 'es-ES';
      u.onstart = () => set('ttsplay', 'Reproduccion de voz', 'SUENA', 'ok');
      u.onerror = (e) => set('ttsplay', 'Reproduccion de voz', `ERROR: ${e.error}`, 'bad');
      speechSynthesis.speak(u);
      countVoices();
    });
  }

  // ---------------------------------------------------- brujula
  //
  // El GPS solo sabe tu rumbo cuando te MUEVES. Parado, la brujula es lo unico
  // que dice hacia donde miras. En iOS hace falta permiso explicito pedido
  // desde un gesto del usuario: de ahi que esto sea un boton y no automatico.

  if (!compass.supported) {
    set('compass', 'Brujula', 'NO SOPORTADA', 'warn');
    compassBtn.disabled = true;
  } else {
    set(
      'compass',
      'Brujula',
      compass.needsPermission ? 'pulsa para activar' : 'disponible',
      'pending',
    );

    compassBtn.addEventListener('click', async () => {
      compassBtn.disabled = true;
      const resultado = await compass.enable();
      if (resultado === 'granted') {
        set('compass', 'Brujula', 'ACTIVA', 'ok');
        compassBtn.textContent = 'Brujula activa';
      } else {
        compassBtn.disabled = false;
        set(
          'compass',
          'Brujula',
          resultado === 'denied' ? 'PERMISO DENEGADO' : 'NO SOPORTADA',
          'bad',
        );
      }
    });

    // El rumbo en vivo es lo que demuestra que funciona de verdad, en vez de
    // limitarse a decir que el permiso se concedio.
    compass.onHeading((deg) => set('heading', 'Rumbo brujula', `${Math.round(deg)}°`, 'ok'));
  }

  render();

  return { el };
}
