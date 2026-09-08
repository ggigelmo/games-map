/**
 * Mantener la pantalla encendida.
 *
 * Ya habia codigo de Wake Lock en main.ts y no funcionaba en el iPhone del
 * usuario. Tres causas posibles, ninguna descartable sin el dispositivo:
 *
 *  1. La API estuvo **rota en PWAs instaladas hasta iOS 18.4**.
 *  2. El sistema suelta el bloqueo por su cuenta y nadie lo volvia a pedir:
 *     solo se reintentaba en `visibilitychange`, no al oir el evento `release`.
 *  3. La peticion se hacia al cargar la pagina, cuando el documento puede no
 *     estar aun visible, y entonces lanza `NotAllowedError` sin reintento.
 *
 * En vez de reimplementarlo se usa **nosleep.js**, que ya cubre las tres: pide
 * la Wake Lock API cuando existe, escucha su liberacion, reintenta al volver a
 * primer plano, y si no hay API cae a reproducir un video mudo de un fotograma
 * en bucle, que es el truco que mantiene despierto a iOS desde antes de que la
 * API existiera. Hacerlo a mano significaria incrustar los mismos bytes.
 *
 * Este modulo solo aporta lo que falta: saber QUE via esta activa, para que el
 * panel DIAG lo diga y la proxima vez no haya que adivinar.
 */
import NoSleep from 'nosleep.js';

export type KeepAwakeMethod = 'API' | 'VIDEO' | 'NINGUNO';

/**
 * La misma condicion que usa nosleep.js para decidir. Se comprueba aqui en vez
 * de leer sus campos privados.
 */
const HAS_API = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export class KeepAwake {
  private noSleep = new NoSleep();
  /** Si el usuario/la app quiere la pantalla encendida. */
  private wanted = false;

  method: KeepAwakeMethod = 'NINGUNO';
  onChange: ((method: KeepAwakeMethod) => void) | null = null;

  constructor() {
    // El video se puede pausar al volver del segundo plano, y una peticion de
    // API que fallo por documento no visible merece otra oportunidad.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wanted) void this.enable();
    });
  }

  /**
   * Conviene llamarlo tambien desde un gesto del usuario (un click): es cuando
   * iOS es mas propenso a conceder el bloqueo, y el video necesita el gesto
   * para poder arrancar.
   */
  async enable(): Promise<KeepAwakeMethod> {
    this.wanted = true;
    try {
      await this.noSleep.enable();
      this.set(HAS_API ? 'API' : 'VIDEO');
    } catch {
      // Sin bloqueo la app sigue funcionando; solo se apaga la pantalla.
      this.set('NINGUNO');
    }
    return this.method;
  }

  disable() {
    this.wanted = false;
    try {
      this.noSleep.disable();
    } catch {
      // Da igual: si no se pudo soltar, el sistema lo hara al cerrar.
    }
    this.set('NINGUNO');
  }

  private set(method: KeepAwakeMethod) {
    if (this.method === method) return;
    this.method = method;
    this.onChange?.(method);
  }
}
