// Explicit checks complement the browser's own service worker update checks.
export function createUpdateChecker(update: () => Promise<unknown>, now = Date.now) {
  let lastAttempt = now();
  let checking = false;
  return async (visible: boolean, online: boolean) => {
    if (!visible || !online || checking || now() - lastAttempt < 3_600_000) return;
    lastAttempt = now(); checking = true;
    try { await update(); } catch { /* Keep the currently usable version. */ }
    finally { checking = false; }
  };
}

export function createUpdateActivation(activate: () => Promise<unknown>) {
  let requested = false, activating = false, activated = false;
  async function flush(blocked: boolean) {
    if (!requested || blocked || activating || activated) return;
    activating = true;
    try { await activate(); activated = true; requested = false; }
    catch { requested = false; throw new Error('No pudimos actualizar la app. Intentá de nuevo.'); }
    finally { activating = false; }
  }
  return {
    request(blocked: boolean) { requested = true; return flush(blocked); },
    cancel() { requested = false; },
    flush,
  };
}
