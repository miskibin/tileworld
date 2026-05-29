import { useEffect } from 'react'
import { selectSlot, activateSelected, HOTBAR_SIZE } from './inventoryStore'
import { isFrozen } from './pauseStore'

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
    // Right-click uses the selected slot. We listen on mousedown (button 2)
    // rather than the contextmenu event because the browser suppresses
    // contextmenu while the pointer is locked — i.e. exactly while playing.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return
      const target = e.target as Element | null
      // Let the inventory HUD's own slot handlers manage right-clicks on it.
      if (target && target.closest('.hud')) return
      if (isFrozen()) return
      activateSelected()
    }
    // Still suppress the browser context menu over the canvas.
    const onContext = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (target && target.closest('.hud')) return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('contextmenu', onContext)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [])

  return null
}
