/**
 * Brujula del dispositivo.
 *
 * Existe porque el GPS solo sabe tu rumbo cuando te MUEVES: parado o andando
 * despacio, `coords.heading` viene a null y el mapa se queda mirando al norte.
 * La brujula dice hacia donde apuntas aunque estes quieto.
 *
 * En marcha manda el GPS, no esto: con el movil en un soporte, la orientacion
 * del aparato no tiene por que coincidir con la direccion del coche. Quien
 * decide cual usar es MapView.
 */

/** Grados de cambio por debajo de los cuales se ignora la lectura. */
const DEADBAND_DEG = 2;

/** La brujula dispara decenas de veces por segundo; con esto basta de sobra. */
const THROTTLE_MS = 100;

type PermissionResult = 'granted' | 'denied' | 'unsupported';

interface IOSDeviceOrientationEvent extends DeviceOrientationEvent {
  /** Solo en iOS: rumbo respecto al norte, horario. Ya viene listo. */
  webkitCompassHeading?: number;
}

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState | 'granted' | 'denied'>;
};

export class Compass {
  private subs = new Set<(heading: number) => void>();
  private listening = false;
  private lastEmit = 0;

  /** Ultimo rumbo conocido en grados (0 = norte), o null. */
  heading: number | null = null;

  /** Si el navegador expone el evento siquiera. */
  readonly supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;

  /**
   * iOS exige pedir permiso explicitamente, y solo desde un gesto del usuario.
   * En Android y escritorio el evento llega sin pedir nada.
   */
  readonly needsPermission =
    this.supported && typeof (window.DeviceOrientationEvent as OrientationCtor).requestPermission === 'function';

  onHeading(cb: (heading: number) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  /**
   * Pide permiso y arranca. DEBE llamarse desde un manejador de click o iOS lo
   * rechaza sin preguntar siquiera.
   */
  async enable(): Promise<PermissionResult> {
    if (!this.supported) return 'unsupported';

    if (this.needsPermission) {
      const ctor = window.DeviceOrientationEvent as OrientationCtor;
      try {
        const answer = await ctor.requestPermission!();
        if (answer !== 'granted') return 'denied';
      } catch {
        // Lanza si no viene de un gesto del usuario.
        return 'denied';
      }
    }

    this.listen();
    return 'granted';
  }

  private listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('deviceorientation', this.onEvent, true);
  }

  stop() {
    window.removeEventListener('deviceorientation', this.onEvent, true);
    this.listening = false;
  }

  private onEvent = (raw: Event) => {
    const e = raw as IOSDeviceOrientationEvent;

    let deg: number | null = null;
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      // iOS ya lo da como rumbo de brujula.
      deg = e.webkitCompassHeading;
    } else if (e.absolute && e.alpha !== null) {
      // El estandar mide alpha en sentido ANTIhorario desde el norte, asi que
      // hay que darle la vuelta para tener un rumbo de brujula.
      deg = (360 - e.alpha) % 360;
    }
    if (deg === null || Number.isNaN(deg)) return;

    // Banda muerta: sin esto, el ruido del magnetometro hace vibrar el mapa
    // aunque tengas el movil quieto encima de la mesa.
    if (this.heading !== null && angleDelta(this.heading, deg) < DEADBAND_DEG) return;

    const now = performance.now();
    if (now - this.lastEmit < THROTTLE_MS) return;
    this.lastEmit = now;

    this.heading = deg;
    for (const cb of this.subs) cb(deg);
  };
}

/**
 * Diferencia angular mas corta entre dos rumbos, en grados (0..180).
 *
 * Lo importante es que cruce bien el norte: de 350 a 10 son 20 grados, no 340.
 * El doble modulo es para que funcione tambien con diferencias negativas, que
 * el `%` de JavaScript no normaliza.
 */
export function angleDelta(a: number, b: number): number {
  const d = ((((b - a) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}
