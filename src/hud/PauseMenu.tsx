import { useEffect, useState } from 'react'
import {
  isPaused,
  setPaused,
  subscribePaused,
  togglePaused,
} from '../world/pauseStore'
import { isShopOpen } from '../world/shopStore'
import { isTreeOpen } from '../world/townHallStore'
import { isInventoryOpen } from '../world/inventoryStore'
import { isSettingsOpen, openSettings } from '../world/settingsStore'
import { isStarted, setPhase } from '../world/gameStore'
import { resetRun } from '../world/runReset'
import { bumpRun } from '../world/runStore'
import {
  isShowPaths,
  setShowPaths,
  subscribeShowPaths,
} from '../world/debugStore'

// Quit only works in the Tauri desktop shell (a browser tab can't close itself).
const IS_TAURI =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

export function PauseMenu() {
  const [paused, setPausedState] = useState<boolean>(isPaused())
  const [paths, setPathsState] = useState<boolean>(isShowPaths())
  // Two-click guard on the destructive "Return to Menu" — the second click
  // within the open panel confirms. Reset whenever the panel hides.
  const [confirmExit, setConfirmExit] = useState(false)

  // Reset the abandon-confirm whenever the panel closes (folded into the
  // subscription so we don't setState synchronously inside an effect body).
  useEffect(
    () =>
      subscribePaused((p) => {
        setPausedState(p)
        if (!p) setConfirmExit(false)
      }),
    [],
  )
  useEffect(() => subscribeShowPaths(setPathsState), [])

  // Esc toggles pause — but defer to any open modal (shop / tree / inventory /
  // settings own their own Esc), and don't pause before the game has started.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (isShopOpen() || isTreeOpen() || isInventoryOpen() || isSettingsOpen() || !isStarted()) return
        e.preventDefault()
        togglePaused()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The StartScreen owns the overlay before the game starts; the settings panel
  // renders above the pause card when open.
  if (!paused || !isStarted()) return null

  // Return to the title screen: wipe the run in memory + remount the world.
  const returnToMenu = () => {
    resetRun()
    setPhase('menu')
    bumpRun()
  }

  return (
    <div className="pause-screen">
      <div className="pause-card pause-card-anim">
        <div className="pause-title">PAUSED</div>
        <button className="pause-btn pause-btn-primary" onClick={() => setPaused(false)}>
          Resume
        </button>
        <button className="pause-btn" onClick={openSettings}>
          Settings
        </button>
        {confirmExit ? (
          <button className="pause-btn pause-btn-danger" onClick={returnToMenu}>
            Abandon run — sure?
          </button>
        ) : (
          <button className="pause-btn" onClick={() => setConfirmExit(true)}>
            Return to Menu
          </button>
        )}
        {IS_TAURI && (
          <button className="pause-btn" onClick={() => window.close()}>
            Quit
          </button>
        )}
        {import.meta.env.DEV && (
          <button className="pause-btn pause-btn-dev" onClick={() => setShowPaths(!paths)}>
            AI paths: {paths ? 'On' : 'Off'}
          </button>
        )}
        <div className="pause-hint">Esc to resume</div>
      </div>
    </div>
  )
}
