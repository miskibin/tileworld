import { useEffect, useState } from 'react'
import {
  getItemToasts,
  subscribeItemToasts,
  removeItemToast,
} from '../world/itemToastStore'
import { ITEM_DEFS, itemStatLine, pickupNote } from '../world/inventoryStore'

// Pickup toast stack (top-right). One card per acquired item — icon + name
// (×count when a stack), its stat line, and a type-dependent "how to use it"
// note. Renders nothing when idle (no HUD chrome at rest). Re-renders on
// push/remove; a light rAF prunes cards older than LIFETIME_MS, matching the
// BuffBar pattern (no idle loop — the rAF only runs while a toast is showing).

const LIFETIME_MS = 4000

export function ItemToasts() {
  const [ids, setIds] = useState<number[]>([])

  // Re-render the card set on push/remove.
  useEffect(() => {
    const sync = () => setIds(getItemToasts().map((t) => t.id))
    sync()
    return subscribeItemToasts(sync)
  }, [])

  // Expire cards by age. Only runs while at least one toast is shown.
  useEffect(() => {
    if (ids.length === 0) return
    let raf = 0
    const tick = () => {
      const now = performance.now()
      for (const t of getItemToasts()) {
        if (now - t.born > LIFETIME_MS) removeItemToast(t.id)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ids])

  const toasts = getItemToasts()
  if (toasts.length === 0) return null

  return (
    <div className="item-toasts">
      {toasts.map((t) => {
        const def = ITEM_DEFS[t.itemId]
        if (!def) return null
        return (
          <div key={t.id} className="item-toast" onClick={() => removeItemToast(t.id)}>
            <span className="item-toast-icon">{def.icon}</span>
            <span className="item-toast-text">
              <span className="item-toast-name">
                {def.name}
                {t.count > 1 && <span className="item-toast-count"> ×{t.count}</span>}
              </span>
              <span className="item-toast-stat">{itemStatLine(def)}</span>
              <span className="item-toast-note">{pickupNote(def)}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
