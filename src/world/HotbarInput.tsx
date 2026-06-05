import { useEffect } from 'react'
import { eatFood, activateBuff, toggleInventory, isInventoryOpen } from './inventoryStore'
import { isFrozen, isPaused } from './pauseStore'
import { isShopOpen } from './shopStore'
import { isTreeOpen } from './townHallStore'
import { setWantBlock } from './blockStore'

// Non-visual input glue for the quick-use bar + inventory:
//  • Q eats the next food in the bag (heal + any bonus buff)
//  • Z / X / C use the next Resist / Power / Haste item
//  • I toggles the inventory panel (a modal that freezes the world)
//  • right-mouse (hold) raises the shield (blockStore); release lowers it
// ctrl+scroll zooms the camera (see MouseLookCamera); plain scroll is now free.
// Lives in the canvas tree so it mounts/unmounts with the world.
export function HotbarInput() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // I toggles the bag. Opening is blocked while another modal/pause holds the
      // world, but closing always works (it's the only thing freezing then).
      if (e.code === 'KeyI') {
        // Closing always works (the open bag is the only thing freezing then);
        // opening is blocked while another modal/pause already holds the world.
        if (isInventoryOpen() || (!isShopOpen() && !isTreeOpen() && !isPaused())) {
          toggleInventory()
        }
        return
      }
      // Quick-use keys only fire in live play (never behind a panel).
      if (isFrozen()) return
      if (e.code === 'KeyQ') eatFood()
      else if (e.code === 'KeyZ') activateBuff('resist')
      else if (e.code === 'KeyX') activateBuff('power')
      else if (e.code === 'KeyC') activateBuff('haste')
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
