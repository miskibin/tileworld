import { useEffect, useState } from 'react'
import {
  isPaused,
  setPaused,
  subscribePaused,
  togglePaused,
} from '../world/pauseStore'
import { isShopOpen } from '../world/shopStore'
import { isTreeOpen } from '../world/townHallStore'
import { isStarted } from '../world/gameStore'
import {
  isEnabled as isAudioEnabled,
  setEnabled as setAudioEnabled,
  subscribeEnabled as subscribeAudio,
} from '../audio/audio'
import {
  isShowPaths,
  setShowPaths,
  subscribeShowPaths,
} from '../world/debugStore'

export function PauseMenu() {
  const [paused, setPausedState] = useState<boolean>(isPaused())
  const [audio, setAudioState] = useState<boolean>(isAudioEnabled())
  const [paths, setPathsState] = useState<boolean>(isShowPaths())

  useEffect(() => subscribePaused(setPausedState), [])
  useEffect(() => subscribeAudio(setAudioState), [])
  useEffect(() => subscribeShowPaths(setPathsState), [])

  // Esc toggles pause — but defer to the shop panel / upgrade tree if open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (isShopOpen() || isTreeOpen() || !isStarted()) return
        e.preventDefault()
        togglePaused()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Before the game starts, the StartScreen owns the overlay.
  if (!paused || !isStarted()) return null

  return (
    <div className="pause-screen">
      <div className="pause-card pause-card-anim">
        <div className="pause-title">PAUSED</div>
        <button className="pause-btn pause-btn-primary" onClick={() => setPaused(false)}>
          Resume
        </button>
        <button className="pause-btn" onClick={() => setAudioEnabled(!audio)}>
          Audio: {audio ? 'On' : 'Off'}
        </button>
        <button className="pause-btn" onClick={() => setShowPaths(!paths)}>
          AI paths: {paths ? 'On' : 'Off'}
        </button>
        <div className="pause-hint">Esc to resume</div>
      </div>
    </div>
  )
}
