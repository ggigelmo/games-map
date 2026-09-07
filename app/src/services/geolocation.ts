/**
 * Unico dueno del `watchPosition`. Reparte las lecturas a quien las necesite.
 *
 * Antes el dueno era el panel de diagnostico (`diag/probe.ts`), que fue lo
 * pragmatico cuando solo el HUD consumia la posicion. Con el routing entrando
 * en escena habria dos suscriptores colgando de un panel de depuracion, asi que
 * se extrae aqui.
 *
 * Solo hace UNA cosa: mantener viva la suscripcion al GPS y difundir lo que
 * llega. Las estadisticas (precision media, intervalos) las calcula el panel de
 * diagnostico a partir de este flujo; no son asunto de este modulo.
 */

export interface Fix {
  lng: number;
  lat: number;
  /** grados, o null si el GPS no lo sabe (parado) */
  heading: number | null;
  /** m/s, o null */
  speed: number | null;
  accuracy: number;
  /** `performance.now()` de cuando llego, para medir intervalos */
  at: number;
}

export type GeoFailure =
  | { kind: 'unsupported' }
  /**
   * El permiso nunca respondio. En PWAs instaladas en iOS hay un bug historico
   * por el que el dialogo no aparece y la llamada tampoco hace timeout, asi que
   * hace falta un temporizador propio: el de la API no salta.
   */
  | { kind: 'silent' }
  | { kind: 'error'; code: number; message: string };

/** Cuanto esperar antes de dar el permiso por no respondido. */
const SILENCE_MS = 12_000;

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

export class GeoWatcher {
  private fixSubs = new Set<(fix: Fix) => void>();
  private failSubs = new Set<(failure: GeoFailure) => void>();
  private watchId: number | null = null;
  private silenceTimer: number | null = null;
  private answered = false;

  /** Ultima lectura conocida, o null si aun no ha llegado ninguna. */
  last: Fix | null = null;

  /** Momento en que se llamo a `start()`, para medir el primer fix. */
  readonly startedAt = performance.now();

  /** @returns funcion para darse de baja */
  onFix(cb: (fix: Fix) => void): () => void {
    this.fixSubs.add(cb);
    // Quien llega tarde recibe la ultima lectura en vez de esperar a la
    // siguiente, que con el GPS puede tardar segundos.
    if (this.last) cb(this.last);
    return () => this.fixSubs.delete(cb);
  }

  /** @returns funcion para darse de baja */
  onFailure(cb: (failure: GeoFailure) => void): () => void {
    this.failSubs.add(cb);
    return () => this.failSubs.delete(cb);
  }

  start() {
    if (this.watchId !== null) return;

    if (!('geolocation' in navigator)) {
      this.fail({ kind: 'unsupported' });
      return;
    }

    this.silenceTimer = window.setTimeout(() => {
      if (!this.answered) this.fail({ kind: 'silent' });
    }, SILENCE_MS);

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.settle();
        const fix: Fix = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          accuracy: pos.coords.accuracy,
          at: performance.now(),
        };
        this.last = fix;
        for (const cb of this.fixSubs) cb(fix);
      },
      (err) => {
        this.settle();
        const messages: Record<number, string> = {
          1: 'PERMISO DENEGADO',
          2: 'POSICION NO DISPONIBLE',
          3: 'TIMEOUT',
        };
        this.fail({
          kind: 'error',
          code: err.code,
          message: messages[err.code] ?? `ERROR ${err.code}`,
        });
      },
      OPTIONS,
    );
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.settle();
  }

  private settle() {
    this.answered = true;
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private fail(failure: GeoFailure) {
    this.settle();
    for (const cb of this.failSubs) cb(failure);
  }
}
