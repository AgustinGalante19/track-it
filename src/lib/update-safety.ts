let blocked = false;
const listeners = new Set<() => void>();
export function setUpdateBlocked(value: boolean) {
  if (blocked === value) return;
  blocked = value;
  for (const listener of listeners) listener();
}
export function getUpdateBlocked() { return blocked; }
export function subscribeUpdateSafety(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
