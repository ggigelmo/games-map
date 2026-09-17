/**
 * Speech synthesis for maneuvers.
 *
 * iOS requires the session's first `speak()` to come from a real user
 * gesture, or it silently discards it (docs/findings.md §6). That's why
 * whoever calls `speak()` the first time has to do it from inside a click
 * handler (the GO button) and not, for example, from the first GPS fix that
 * arrives afterward.
 */
export class VoiceGuide {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  /**
   * Cuts off whatever is being said and says `text`. Cutting instead of
   * queueing is deliberate: while driving, the most recent instruction is
   * what matters, not a queue of already-stale announcements.
   */
  speak(text: string) {
    if (!this.supported || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  }

  cancel() {
    if (this.supported) speechSynthesis.cancel();
  }
}
