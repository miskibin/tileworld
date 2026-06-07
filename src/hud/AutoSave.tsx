import { useEffect } from 'react'
import { subscribePhase } from '../world/gameStore'
import { writeSave, clearSave } from '../world/saveGame'

// Auto-checkpoint driver. Writes a save on every transition into the prep "day"
// (each dawn, including the first), and clears the slot on victory (the run is
// complete). Defeat keeps the last checkpoint so the player can Continue and retry
// that night.
//
// Mounted in the HUD — OUTSIDE the runId key — so the remount on restart never tears
// it down and misses a phase transition. subscribePhase fires once with the current
// phase on subscribe (menu at boot), which matches neither branch. (loadGame restores
// the stores BEFORE switching to prep, so the prep-write here captures the restored
// state, not defaults.)
export function AutoSave() {
  useEffect(
    () =>
      subscribePhase((p) => {
        if (p === 'prep') writeSave()
        else if (p === 'victory') clearSave()
      }),
    [],
  )
  return null
}
