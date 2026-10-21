/**
 * Serializes test suites that temporarily replace node globals (window,
 * document, navigator, ...).
 *
 * esbuild evaluates every test module up front, so all suites run
 * concurrently. Without a lock, one suite's restore can execute inside another
 * suite's await and delete a global mid-render — react-dom reads `document`
 * during module init, so a document deleted between two awaits crashes the
 * import with `ReferenceError: document is not defined`.
 *
 * Callers register synchronously at module evaluation, so locked suites run in
 * runAll.ts import order. The tail swallows errors so one failed suite cannot
 * poison later waiters.
 */
export function lockTestGlobals<T>(run: () => Promise<T> | T): Promise<T> {
  const g = globalThis as { __testGlobalsChain?: Promise<unknown> };
  const previous = g.__testGlobalsChain ?? Promise.resolve();
  const current = previous.then(run, run);
  g.__testGlobalsChain = current.then(
    () => undefined,
    () => undefined
  );
  return current;
}
