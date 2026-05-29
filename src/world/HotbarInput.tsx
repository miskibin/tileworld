import { useEffect } from 'react'
import { selectSlot, activateSelected, HOTBAR_SIZE } from './inventoryStore'
import { isPaused } from './pauseStore'
import { isShopOpen } from './shopStore'

// Non-visual: binds number keys 1–5 to slot selection and right-click to "use"
// the selected slot (consume → heal, weapon → equip). Lives in the canvas tree
// so it mounts/unmounts with the world.
export function HotbarInput() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5))
        if (n >= 1 && n <= HOTBAR_SIZE) selectSlot(n - 1)
      }
    }
    // Right-click anywhere on the canvas uses the selected slot.
    const onContext = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (target && target.closest('.hud') && !target.closest('.inv-panel')) return
      e.preventDefault()
      if (isPaused() || isShopOpen()) return
      activateSelected()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('contextmenu', onContext)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [])

  return null
}
