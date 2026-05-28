import { useEffect, useState } from 'react'
import {
  isPaused,
  setPaused,
  subscribePaused,
  togglePaused,
} from '../world/pauseStore'
import { isShopOpen } from '../world/shopStore'
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

  // Esc toggles pause — but defer to the shop panel if it's open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (isShopOpen()) return
        e.preventDefault()
        togglePaused()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!paused) return null

  return (
    <div className="pause-screen">
      <div className="pause-card">
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
