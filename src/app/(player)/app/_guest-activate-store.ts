/** Guest activate-sheet state (client-side, plain module).
 *
 * Same pattern as the nav drawer store: the sheet lives in the
 * layout's GuestBanner, but the persistent "Activate account" entry
 * in the sidebar / mobile drawer has to open it from the layout's
 * Tabs, so the open/close state is shared through this store
 * instead of local state. */

let open = false;
const listeners = new Set<() => void>();

export function isActivateOpen(): boolean {
  return open;
}

export function subscribeActivate(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setActivateOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const fn of [...listeners]) fn();
}
