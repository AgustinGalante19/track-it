let dialogs = 0;
const listeners = new Set<() => void>();
export const getDialogCount = () => dialogs;
export function subscribeDialogs(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function trackDialog() {
  dialogs++; for (const listener of listeners) listener();
  return () => { dialogs--; for (const listener of listeners) listener(); };
}
