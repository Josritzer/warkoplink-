/**
 * Run a React page update inside the browser's native View Transitions API.
 * Older browsers and reduced-capability environments keep the normal update path.
 */
export function runViewTransition(update, documentRef = globalThis.document) {
  if (typeof update !== 'function') return undefined;
  const start = documentRef?.startViewTransition;
  if (typeof start !== 'function') {
    update();
    return undefined;
  }

  try {
    return start.call(documentRef, update);
  } catch {
    update();
    return undefined;
  }
}
