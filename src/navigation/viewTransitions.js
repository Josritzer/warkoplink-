/**
 * Run a React page update inside the browser's native View Transitions API.
 * Older browsers, reduced-motion users, and API failures use a normal update.
 */
export function runViewTransition(update, documentRef = globalThis.document) {
  if (typeof update !== 'function') return undefined;

  const runUpdate = (() => {
    let didUpdate = false;
    return () => {
      if (didUpdate) return;
      didUpdate = true;
      update();
    };
  })();

  const matchMedia = documentRef?.defaultView?.matchMedia?.bind(documentRef.defaultView);
  const reduceMotion = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const touchFirst = matchMedia?.('(pointer: coarse)')?.matches;
  const start = documentRef?.startViewTransition;
  // Native snapshot transitions can stutter on mid-range Android GPUs, especially
  // while the app chrome uses backdrop-filter. Keep touch navigation immediate.
  if (reduceMotion || touchFirst || typeof start !== 'function') {
    runUpdate();
    return undefined;
  }

  try {
    return start.call(documentRef, runUpdate);
  } catch {
    runUpdate();
    return undefined;
  }
}
