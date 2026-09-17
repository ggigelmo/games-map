/**
 * Keep the screen on.
 *
 * There was already Wake Lock code in main.ts and it didn't work on the
 * user's iPhone. Three possible causes, none rule-out-able without the
 * device:
 *
 *  1. The API was **broken in installed PWAs up through iOS 18.4**.
 *  2. The system releases the lock on its own and nothing ever asked for it
 *     again: it only retried on `visibilitychange`, not on hearing the
 *     `release` event.
 *  3. The request was made on page load, when the document may not yet be
 *     visible, in which case it throws `NotAllowedError` with no retry.
 *
 * Instead of reimplementing it, this uses **nosleep.js**, which already
 * covers all three: it requests the Wake Lock API when it exists, listens
 * for its release, retries on returning to the foreground, and if there's no
 * API falls back to looping a silent one-frame video, which is the trick
 * that has kept iOS awake since before the API existed. Doing it by hand
 * would mean embedding the same bytes.
 *
 * This module only adds what's missing: knowing WHICH method is active, so
 * the DIAG panel can say so and next time there's no need to guess.
 */
import NoSleep from 'nosleep.js';

export type KeepAwakeMethod = 'API' | 'VIDEO' | 'NONE';

/**
 * The same condition nosleep.js uses to decide. Checked here instead of
 * reading its private fields.
 */
const HAS_API = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export class KeepAwake {
  private noSleep = new NoSleep();
  /** Whether the user/app wants the screen on. */
  private wanted = false;

  method: KeepAwakeMethod = 'NONE';
  onChange: ((method: KeepAwakeMethod) => void) | null = null;

  constructor() {
    // The video can pause on returning from the background, and an API
    // request that failed because the document wasn't visible deserves
    // another chance.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wanted) void this.enable();
    });
  }

  /**
   * Worth calling this from a user gesture too (a click): that's when iOS is
   * most likely to grant the lock, and the video needs the gesture to be
   * able to start.
   */
  async enable(): Promise<KeepAwakeMethod> {
    this.wanted = true;
    try {
      await this.noSleep.enable();
      this.set(HAS_API ? 'API' : 'VIDEO');
    } catch {
      // Without a lock the app still works; only the screen turns off.
      this.set('NONE');
    }
    return this.method;
  }

  disable() {
    this.wanted = false;
    try {
      this.noSleep.disable();
    } catch {
      // Doesn't matter: if it couldn't be released, the system will on close.
    }
    this.set('NONE');
  }

  private set(method: KeepAwakeMethod) {
    if (this.method === method) return;
    this.method = method;
    this.onChange?.(method);
  }
}
