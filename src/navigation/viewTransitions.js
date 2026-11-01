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

  const reduceMotion = documentRef?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const start = documentRef?.startViewTransition;
  if (reduceMotion || typeof start !== 'function') {
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
