import { useEffect } from 'react'
import { selectSlot, activateSelected, HOTBAR_SIZE } from './inventoryStore'
import { isFrozen } from './pauseStore'
import { setWantBlock } from './blockStore'

// Non-visual input glue:
//  • number keys 1–5 select a hotbar slot
//  • Q "uses" the selected slot (consume → heal, weapon → equip) — moved off
//    right-click now that right-click raises the shield
//  • right-mouse (hold) raises the shield (blockStore); release lowers it
// Lives in the canvas tree so it mounts/unmounts with the world.
export function HotbarInput() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5))
        if (n >= 1 && n <= HOTBAR_SIZE) selectSlot(n - 1)
      } else if (e.code === 'KeyQ') {
        if (isFrozen()) return
        activateSelected()
      }
    }
    // Right-mouse raises the shield. We listen on mousedown/up (button 2)
    // rather than the contextmenu event because the browser suppresses
    // contextmenu while the pointer is locked — i.e. exactly while playing.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return
      const target = e.target as Element | null
      // Don't start a block when interacting with the HUD.
      if (target && target.closest('.hud')) return
      if (isFrozen()) return
      setWantBlock(true)
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return
      setWantBlock(false)
    }
    // Safety: drop the shield if focus/pointer leaves the window mid-hold.
    const dropBlock = () => setWantBlock(false)
    // Still suppress the browser context menu over the canvas.
    const onContext = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (target && target.closest('.hud')) return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('blur', dropBlock)
    window.addEventListener('contextmenu', onContext)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('blur', dropBlock)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [])

  return null
}
