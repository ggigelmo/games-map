/**
 * Cliente HTTP comun de Stadia Maps.
 *
 * NO lleva clave de API. Stadia autentica por dominio: valida las cabeceras
 * `Origin` y `Referer` que el navegador manda solo, asi que basta con dar de
 * alta el dominio en el panel de Stadia. Desde `localhost` funciona sin nada
 * (con limite de peticiones mas estricto).
 *
 * Consecuencia importante: si alguna vez se pone `Referrer-Policy: no-referrer`
 * en el sitio, la autenticacion deja de funcionar.
 */

const BASE = 'https://api.stadiamaps.com';
const TIMEOUT_MS = 8_000;

/** Error con un mensaje que la interfaz puede enseñar tal cual. */
export class StadiaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'StadiaError';
  }
}

/**
 * Combina el `signal` de quien llama con un limite de tiempo propio.
 *
 * Sin el limite, una peticion en una zona sin cobertura se queda colgada para
 * siempre y la interfaz se queda en "buscando..." indefinidamente.
 */
function abortable(external: AbortSignal | undefined, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new StadiaError('Tardo demasiado')), ms);
  external?.addEventListener('abort', () => ctrl.abort(external.reason), { once: true });
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

export async function stadiaGet<T>(
  path: string,
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const { signal: merged, done } = abortable(signal, TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: merged });
    if (!res.ok) {
      // 401/403 aqui casi siempre significa que falta dar de alta el dominio.
      const hint =
        res.status === 401 || res.status === 403
          ? 'Dominio no autorizado en Stadia Maps'
          : `Error ${res.status}`;
      throw new StadiaError(hint, res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof StadiaError) throw err;
    // Una cancelacion deliberada no es un fallo: se propaga tal cual para que
    // quien llama la distinga (el autocompletado cancela sin parar).
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new StadiaError('Sin conexion');
  } finally {
    done();
  }
}
