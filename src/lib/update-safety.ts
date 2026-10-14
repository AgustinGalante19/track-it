let blocked = false;
let holds = 0;
const listeners = new Set<() => void>();
export function setUpdateBlocked(value: boolean) {
  if (blocked === value) return;
  blocked = value;
  for (const listener of listeners) listener();
}
export function getUpdateBlocked() { return blocked || holds > 0; }
export function holdUpdate() {
  holds++;
  for (const listener of listeners) listener();
  let released = false;
  return () => {
    if (released) return;
    released = true; holds--;
    for (const listener of listeners) listener();
  };
}
export function subscribeUpdateSafety(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
