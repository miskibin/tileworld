import { useEffect, useState } from 'react'
import {
  isSettingsOpen,
  closeSettings,
  subscribeSettings,
} from '../world/settingsStore'
import {
  isEnabled as isAudioEnabled,
  setEnabled as setAudioEnabled,
  subscribeEnabled as subscribeAudio,
} from '../audio/audio'
import { getQuality, setQuality, subscribeQuality, type Quality } from '../world/qualityStore'
import {
  isFullscreen,
  toggleFullscreen,
  subscribeFullscreen,
} from '../world/fullscreenStore'

const QUALITIES: Quality[] = ['low', 'medium', 'high']

/**
 * One shared settings overlay, opened from the StartScreen and the PauseMenu.
 * Lean by design: audio on/off, graphics quality, fullscreen — nothing more.
 * Opening it freezes the world (settingsStore is ORed into isFrozen). Esc closes.
 */
export function SettingsPanel() {
  const [open, setOpen] = useState<boolean>(isSettingsOpen())
  const [audio, setAudio] = useState<boolean>(isAudioEnabled())
  const [quality, setQualityState] = useState<Quality>(getQuality())
  const [fullscreen, setFullscreen] = useState<boolean>(isFullscreen())

  useEffect(() => subscribeSettings(setOpen), [])
  useEffect(() => subscribeAudio(setAudio), [])
  useEffect(() => subscribeQuality(setQualityState), [])
  useEffect(() => subscribeFullscreen(setFullscreen), [])

  // Esc closes the panel (and is swallowed so it doesn't also toggle pause).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeSettings()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null

  return (
    <div className="settings-screen" onClick={closeSettings}>
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <div className="settings-title">Settings</div>

        <div className="settings-row">
          <span className="settings-label">Audio</span>
          <button
            className={'settings-toggle' + (audio ? ' is-on' : '')}
            onClick={() => setAudioEnabled(!audio)}
            aria-pressed={audio}
          >
            {audio ? 'On' : 'Off'}
          </button>
        </div>

        <div className="settings-row">
          <span className="settings-label">Graphics</span>
          <div className="seg" role="group" aria-label="Quality preset">
            {QUALITIES.map((q) => (
              <button
                key={q}
                className={'seg-btn' + (q === quality ? ' seg-on' : '')}
                onClick={() => setQuality(q)}
                aria-pressed={q === quality}
              >
                {q[0].toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Fullscreen</span>
          <button
            className={'settings-toggle' + (fullscreen ? ' is-on' : '')}
            onClick={toggleFullscreen}
            aria-pressed={fullscreen}
          >
            {fullscreen ? 'On' : 'Off'}
          </button>
        </div>

        <button className="settings-done" onClick={closeSettings}>
          Done
        </button>
      </div>
    </div>
  )
}
