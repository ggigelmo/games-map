/**
 * Common HTTP client for Stadia Maps.
 *
 * Carries NO API key. Stadia authenticates by domain: it validates the
 * `Origin` and `Referer` headers that the browser sends on its own, so it's
 * enough to register the domain in Stadia's panel. From `localhost` it works
 * with nothing (with a stricter rate limit).
 *
 * Important consequence: if `Referrer-Policy: no-referrer` is ever set on the
 * site, authentication stops working.
 */

const BASE = 'https://api.stadiamaps.com';
const TIMEOUT_MS = 8_000;

/** Shown both for a real 429 from Stadia and for the local self-imposed cap
 * in `search-limit.ts`, so the experience is identical either way. */
export const QUOTA_MESSAGE = 'Demo search limit reached for now, try again later';

/** Error with a message the UI can show as-is. */
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
 * Combines the caller's `signal` with a timeout of our own.
 *
 * Without the timeout, a request in an area with no coverage hangs forever
 * and the UI stays stuck on "searching..." indefinitely.
 */
function abortable(external: AbortSignal | undefined, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new StadiaError('Took too long')), ms);
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
      // A 401/403 here almost always means the domain isn't registered yet.
      // A 429 means the free tier's shared quota ran out for this stretch:
      // expected on a demo with no per-user key, not a bug to chase.
      const hint =
        res.status === 401 || res.status === 403
          ? 'Domain not authorized with Stadia Maps'
          : res.status === 429
            ? QUOTA_MESSAGE
            : `Error ${res.status}`;
      throw new StadiaError(hint, res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof StadiaError) throw err;
    // A deliberate cancellation is not a failure: it's propagated as-is so
    // the caller can tell it apart (autocomplete cancels constantly).
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new StadiaError('No connection');
  } finally {
    done();
  }
}
