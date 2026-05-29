// Open/close state for the upgrade-tree panel, opened by interacting with the
// Town Hall. Dedicated boolean pub/sub store (like gameStore/debugStore) — the
// panel reads node data from upgradeStore, so this only carries open/closed.

let open = false
const subs = new Set<(open: boolean) => void>()

export function isTreeOpen(): boolean {
  return open
}

export function openTree(): void {
  if (open) return
  open = true
  subs.forEach((fn) => fn(open))
}

export function closeTree(): void {
  if (!open) return
  open = false
  subs.forEach((fn) => fn(open))
}

export function subscribeTree(fn: (open: boolean) => void): () => void {
  subs.add(fn)
  fn(open) // emit current value on subscribe, matching the other stores
  return () => {
    subs.delete(fn)
  }
}
