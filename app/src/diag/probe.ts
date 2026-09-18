/**
 * Diagnostics panel. Exists to answer one question empirically: can a PWA on
 * iOS hold up to what a navigation app needs?
 *
 * The three known risks it measures:
 *
 *  1. "Precise Location" disabled for Safari -> watchPosition returns 3-9 km
 *     accuracy and only refreshes every ~15 min. Useless, and it raises no
 *     error: it just lies. Detected via accuracy + interval.
 *  2. Historical bug in standalone mode: the location permission dialog
 *     never appears and the call NEVER times out. Detected with a custom
 *     timer, because the API's own doesn't fire.
 *  3. Screen Wake Lock was broken in installed PWAs up through iOS 18.4.
 *     Without it, the screen turns off mid-trip.
 */

import type { Compass } from '../services/compass';
import type { KeepAwake, KeepAwakeMethod } from '../services/keep-awake';
import type { GeoWatcher } from '../services/geolocation';
import { searchUsage } from '../services/search-limit';

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
 * @param geo     owner of watchPosition; this panel only reports what comes out of it
 * @param compass compass; permission is requested from here, because iOS
 *                requires the request to come from a user gesture
 * @param awake   screen lock; this panel only reports which method is in use
 */
export function mountDiagnostics(
  geo: GeoWatcher,
  compass: Compass,
  awake: KeepAwake,
): Diagnostics {
  const el = document.createElement('section');
  el.className = 'panel';
  el.id = 'diag';

  const rows = new Map<string, Row>();

  // Declared up here because render() reattaches it on every paint, and
  // render() already runs from the first set(), before the voice section.
  const buttons = document.createElement('div');
  buttons.className = 'row';
  buttons.style.marginTop = '10px';

  const voiceBtn = document.createElement('button');
  voiceBtn.className = 'btn btn--ghost';
  voiceBtn.textContent = 'Test voice';

  const compassBtn = document.createElement('button');
  compassBtn.className = 'btn btn--ghost';
  compassBtn.textContent = 'Enable compass';

  buttons.append(voiceBtn, compassBtn);

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
    el.innerHTML = `<h2>Device diagnostics</h2><dl>${items}</dl>`;
    el.appendChild(buttons);
  }

  // ------------------------------------------------------- environment

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari on iOS exposed this instead of display-mode for years.
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  set('mode', 'Mode', standalone ? 'STANDALONE' : 'BROWSER', standalone ? 'ok' : 'warn');

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
    set('ios', 'Platform', isIOS ? 'iOS (version ?)' : 'not iOS', 'warn');
  }

  set(
    'secure',
    'Secure context',
    window.isSecureContext ? 'HTTPS' : 'INSECURE',
    window.isSecureContext ? 'ok' : 'bad',
  );

  // A mount-time snapshot, not live: it won't reflect searches made later
  // in the same session. That's enough to answer "is this browser anywhere
  // near its own self-imposed cap", which is all this row is for.
  const usage = searchUsage();
  set(
    'searchCap',
    'Search quota',
    `${usage.count}/${usage.limit} this month`,
    usage.count >= usage.limit ? 'bad' : 'ok',
  );

  // ---------------------------------------------------- geolocation
  //
  // The watcher no longer lives here: services/geolocation.ts owns it,
  // because routing also needs the position and can't depend on a debug
  // panel. This only reports what comes out of it.

  set('geo', 'GPS: first fix', 'waiting...', 'pending');
  set('acc', 'Accuracy', '-', 'pending');
  set('rate', 'Interval between fixes', '-', 'pending');

  let fixes = 0;
  let lastFixAt = 0;
  const intervals: number[] = [];

  geo.onFix((fix) => {
    fixes += 1;
    if (lastFixAt) intervals.push(fix.at - lastFixAt);
    lastFixAt = fix.at;

    if (fixes === 1) {
      set('geo', 'GPS: first fix', `${Math.round(fix.at - geo.startedAt)} ms`, 'ok');
    }

    const acc = fix.accuracy;
    // >500 m is the signature of "Precise Location" disabled for Safari.
    set(
      'acc',
      'Accuracy',
      `${acc < 1000 ? acc.toFixed(0) + ' m' : (acc / 1000).toFixed(1) + ' km'}  (${fixes} fix)`,
      acc <= 30 ? 'ok' : acc <= 200 ? 'warn' : 'bad',
    );

    if (intervals.length) {
      const med = [...intervals].sort((a, b) => a - b)[intervals.length >> 1]!;
      set(
        'rate',
        'Interval between fixes',
        med < 1000 ? `${med.toFixed(0)} ms` : `${(med / 1000).toFixed(1)} s`,
        med <= 5000 ? 'ok' : med <= 30_000 ? 'warn' : 'bad',
      );
    }
  });

  geo.onFailure((f) => {
    const text =
      f.kind === 'unsupported'
        ? 'NOT SUPPORTED'
        : f.kind === 'silent'
          ? 'NO RESPONSE'
          : f.message;
    set('geo', 'GPS: first fix', text, 'bad');
    if (f.kind === 'silent') set('acc', 'Accuracy', 'permission never resolved', 'bad');
  });

  // -------------------------------------------------- screen wake lock
  //
  // This panel no longer requests the lock itself: services/keep-awake.ts
  // owns it. It used to request it on its own, competing with main.ts for
  // the same resource. Here it only reports which method is working, which
  // is the piece of data that was missing to diagnose it without guessing.

  const paintAwake = (m: KeepAwakeMethod) =>
    set(
      'wake',
      'Screen wake lock',
      m === 'API' ? 'NATIVE API' : m === 'VIDEO' ? 'VIDEO (fallback)' : 'NOT ACTIVE',
      m === 'NONE' ? 'bad' : 'ok',
    );

  paintAwake(awake.method);
  awake.onChange = paintAwake;

  // ------------------------------------------------------------- voice

  if (!('speechSynthesis' in window)) {
    set('tts', 'Speech synthesis', 'NOT SUPPORTED', 'bad');
    voiceBtn.disabled = true;
  } else {
    const countVoices = () => {
      const all = speechSynthesis.getVoices();
      const en = all.filter((v) => v.lang.startsWith('en'));
      set(
        'tts',
        'Voices (en / total)',
        `${en.length} / ${all.length}`,
        en.length > 0 ? 'ok' : all.length > 0 ? 'warn' : 'pending',
      );
    };
    countVoices();
    // On iOS the list arrives asynchronously, sometimes only after the first speak().
    speechSynthesis.addEventListener('voiceschanged', countVoices);

    // iOS requires the FIRST speak() to come from a user gesture.
    // That's why this is a button and not an automatic test.
    voiceBtn.addEventListener('click', () => {
      const u = new SpeechSynthesisUtterance('In two hundred meters, turn right.');
      u.lang = 'en-US';
      u.onstart = () => set('ttsplay', 'Voice playback', 'PLAYING', 'ok');
      u.onerror = (e) => set('ttsplay', 'Voice playback', `ERROR: ${e.error}`, 'bad');
      speechSynthesis.speak(u);
      countVoices();
    });
  }

  // ---------------------------------------------------- compass
  //
  // The GPS only knows your heading while you're MOVING. Stopped, the
  // compass is the only thing that says which way you're facing. iOS
  // requires explicit permission requested from a user gesture: hence this
  // is a button and not automatic.

  if (!compass.supported) {
    set('compass', 'Compass', 'NOT SUPPORTED', 'warn');
    compassBtn.disabled = true;
  } else {
    set(
      'compass',
      'Compass',
      compass.needsPermission ? 'tap to enable' : 'available',
      'pending',
    );

    compassBtn.addEventListener('click', async () => {
      compassBtn.disabled = true;
      const result = await compass.enable();
      if (result === 'granted') {
        set('compass', 'Compass', 'ACTIVE', 'ok');
        compassBtn.textContent = 'Compass active';
      } else {
        compassBtn.disabled = false;
        set(
          'compass',
          'Compass',
          result === 'denied' ? 'PERMISSION DENIED' : 'NOT SUPPORTED',
          'bad',
        );
      }
    });

    // Live heading is what proves it actually works, rather than just
    // saying permission was granted.
    compass.onHeading((deg) => set('heading', 'Compass heading', `${Math.round(deg)}°`, 'ok'));
  }

  render();

  return { el };
}
