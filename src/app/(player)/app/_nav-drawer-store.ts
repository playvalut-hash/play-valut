/** Mobile nav drawer state (client-side, plain module).
 *
 * The drawer lives in the layout's Tabs, but on the chat page the
 * hamburger sits in the chat's own Support header (the app header is
 * hidden there — three stacked bars looked bad), so the open/close
 * state has to be shared through this store instead of local state. */

let open = false;
const listeners = new Set<() => void>();

export function isDrawerOpen(): boolean {
  return open;
}

export function subscribeDrawer(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setDrawerOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const fn of [...listeners]) fn();
}
