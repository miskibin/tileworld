// Transient "you picked up X" notifications, surfaced by the DOM toast stack
// ([ItemToasts.tsx](../hud/ItemToasts.tsx)). Fired from inventoryStore.addItem on
// any genuine acquisition (chest/forage/ground loot/shop buy). Repeated pickups
// of the same item merge into one toast with a bumped count + refreshed clock, so
// grabbing a stack reads as "Apple ×3" rather than three stacked cards. The HUD
// owns the auto-dismiss timing (reads `born`); this store just holds the list.

export interface ItemToast {
  id: number
  itemId: string
  count: number
  /** performance.now() when last pushed/refreshed — HUD uses it to time the fade */
  born: number
}

/** Most toasts shown at once; older ones drop off the top. */
export const MAX_TOASTS = 5

let toasts: ItemToast[] = []
let nextId = 1

const subs = new Set<() => void>()

function notify(): void {
  subs.forEach((fn) => fn())
}

export function getItemToasts(): ItemToast[] {
  return toasts
}

/** Announce an acquired item. Merges into an existing toast for the same item. */
export function pushItemToast(itemId: string, count = 1): void {
  const now = performance.now()
  const existing = toasts.find((t) => t.itemId === itemId)
  if (existing) {
    existing.count += count
    existing.born = now
  } else {
    toasts = [...toasts, { id: nextId++, itemId, count, born: now }]
    if (toasts.length > MAX_TOASTS) toasts = toasts.slice(toasts.length - MAX_TOASTS)
  }
  notify()
}

export function removeItemToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  notify()
}

export function subscribeItemToasts(fn: () => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

export function resetItemToasts(): void {
  toasts = []
  notify()
}
