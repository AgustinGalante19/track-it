export const pwaUpdateReadyEvent = 'track-it:pwa-update-ready';

export async function checkForPwaUpdate(registration: ServiceWorkerRegistration) {
  const current = registration.waiting || registration.installing ? registration : await registration.update();
  const installing = current.installing;
  if (!current.waiting && installing) {
    await new Promise<void>((resolve) => {
      const onStateChange = () => {
        if (installing.state === 'parsed' || installing.state === 'installing') return;
        installing.removeEventListener('statechange', onStateChange);
        resolve();
      };
      installing.addEventListener('statechange', onStateChange);
      onStateChange();
    });
  }
  if (!current.waiting) return false;
  // Reopen the prompt if the user deferred this already-installed update.
  window.dispatchEvent(new Event(pwaUpdateReadyEvent));
  return true;
}

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
