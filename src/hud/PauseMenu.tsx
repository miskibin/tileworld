import { useEffect, useState } from 'react'
import {
  isPaused,
  setPaused,
  shouldPauseOnFullscreenExit,
  subscribePaused,
  togglePaused,
} from '../world/pauseStore'
import { subscribeFullscreen } from '../world/fullscreenStore'
import { isShopOpen } from '../world/shopStore'
import { isTreeOpen } from '../world/townHallStore'
import { isInventoryOpen } from '../world/inventoryStore'
import { isSettingsOpen } from '../world/settingsStore'
import { SettingsControls } from './SettingsControls'
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

  // Esc while fullscreen: the browser exits fullscreen and (in Chrome) eats the
  // keydown, so the handler above never sees it — the player just gets dumped out
  // of fullscreen with no menu. Treat that fullscreen exit as the pause request
  // so Esc still opens the menu (the fullscreen drop itself is unavoidable in the
  // browser). subscribeFullscreen fires once on subscribe with the current value;
  // wasFs starts equal to it so that immediate call is a no-op.
  useEffect(() => {
    let wasFs = false
    return subscribeFullscreen((fs) => {
      const modalOpen =
        isShopOpen() || isTreeOpen() || isInventoryOpen() || isSettingsOpen()
      if (
        shouldPauseOnFullscreenExit(wasFs, fs, {
          started: isStarted(),
          modalOpen,
          paused: isPaused(),
        })
      ) {
        setPaused(true)
      }
      wasFs = fs
    })
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

        <div className="pause-settings">
          <SettingsControls />
        </div>

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
