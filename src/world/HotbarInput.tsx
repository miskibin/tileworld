import { useEffect } from 'react'
import { selectSlot, activateSelected, cycleSelection, HOTBAR_SIZE } from './inventoryStore'
import { isFrozen } from './pauseStore'
import { isInteractInRange } from './interactStore'
import { setWantBlock } from './blockStore'

// Non-visual input glue:
//  • number keys 1–6 select a hotbar slot
//  • E "uses" the selected slot (consume → heal, weapon/armor → equip) — but a
//    building in range owns E (shop/keep), so the hotbar stands down there
//  • scroll wheel cycles the selected slot (hold Alt to zoom the camera instead)
//  • right-mouse (hold) raises the shield (blockStore); release lowers it
// Lives in the canvas tree so it mounts/unmounts with the world.
export function HotbarInput() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5))
        if (n >= 1 && n <= HOTBAR_SIZE) selectSlot(n - 1)
      } else if (e.code === 'KeyE') {
        if (isFrozen()) return
        // A shop / town hall in range claims E (opens the building); don't also
        // consume the selected item on that same press.
        if (isInteractInRange()) return
        activateSelected()
      }
    }
    // Plain wheel scrolls the hotbar selection; Alt+wheel is the camera zoom
    // (handled in MouseLookCamera), so bail when Alt is held.
    const onWheel = (e: WheelEvent) => {
      if (e.altKey || isFrozen()) return
      cycleSelection(e.deltaY > 0 ? 1 : -1)
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
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('blur', dropBlock)
    window.addEventListener('contextmenu', onContext)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('blur', dropBlock)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [])

  return null
}
