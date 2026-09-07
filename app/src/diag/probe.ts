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

type Verdict = 'ok' | 'warn' | 'bad' | 'pending';

interface Row {
  label: string;
  value: string;
  verdict: Verdict;
}

const NO_RESPONSE_MS = 12_000;

export interface Diagnostics {
  el: HTMLElement;
  /** Ultimo estado del GPS, para que el HUD lo reutilice. */
  onFix: (cb: (p: GeolocationPosition) => void) => void;
}

export function mountDiagnostics(): Diagnostics {
  const el = document.createElement('section');
  el.className = 'panel';
  el.id = 'diag';

  const rows = new Map<string, Row>();
  const fixCbs: ((p: GeolocationPosition) => void)[] = [];

  // Se declara aqui arriba porque render() lo reengancha en cada pintada, y
  // render() ya corre desde el primer set(), antes de la seccion de voz.
  const voiceBtn = document.createElement('button');
  voiceBtn.className = 'btn btn--ghost';
  voiceBtn.style.marginTop = '10px';
  voiceBtn.textContent = 'Probar voz';

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
    el.appendChild(voiceBtn);
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

  set('geo', 'GPS: primer fix', 'esperando...', 'pending');
  set('acc', 'Precision', '-', 'pending');
  set('rate', 'Intervalo entre fixes', '-', 'pending');

  const t0 = performance.now();
  let fixes = 0;
  let lastFixAt = 0;
  const intervals: number[] = [];
  let answered = false;

  // El timeout de la API no salta con el bug de standalone. Este si.
  const noResponse = window.setTimeout(() => {
    if (!answered) {
      set(
        'geo',
        'GPS: primer fix',
        'SIN RESPUESTA',
        'bad',
      );
      set('acc', 'Precision', 'permiso nunca resuelto', 'bad');
    }
  }, NO_RESPONSE_MS);

  if (!('geolocation' in navigator)) {
    answered = true;
    clearTimeout(noResponse);
    set('geo', 'GPS: primer fix', 'NO SOPORTADO', 'bad');
  } else {
    navigator.geolocation.watchPosition(
      (pos) => {
        answered = true;
        clearTimeout(noResponse);
        fixes += 1;
        const now = performance.now();
        if (lastFixAt) intervals.push(now - lastFixAt);
        lastFixAt = now;

        if (fixes === 1) {
          set('geo', 'GPS: primer fix', `${Math.round(now - t0)} ms`, 'ok');
        }

        const acc = pos.coords.accuracy;
        // >500 m es la firma de "Ubicacion precisa" desactivada.
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

        for (const cb of fixCbs) cb(pos);
      },
      (err) => {
        answered = true;
        clearTimeout(noResponse);
        const names: Record<number, string> = {
          1: 'PERMISO DENEGADO',
          2: 'POSICION NO DISPONIBLE',
          3: 'TIMEOUT',
        };
        set('geo', 'GPS: primer fix', names[err.code] ?? `ERROR ${err.code}`, 'bad');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }

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

  // ---------------------------------------------------- brujula / rumbo

  const doe = window.DeviceOrientationEvent as
    | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
    | undefined;
  if (!doe) {
    set('compass', 'Brujula', 'NO SOPORTADA', 'warn');
  } else {
    set(
      'compass',
      'Brujula',
      typeof doe.requestPermission === 'function' ? 'requiere permiso' : 'disponible',
      'ok',
    );
  }

  render();

  return {
    el,
    onFix: (cb) => fixCbs.push(cb),
  };
}
