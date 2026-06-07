import { useEffect, useState } from 'react'
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
 * The actual settings controls — audio on/off, graphics quality, fullscreen.
 * Self-contained (subscribes to its own stores) so it can be dropped anywhere:
 * the StartScreen's SettingsPanel overlay and inline in the PauseMenu card.
 */
export function SettingsControls() {
  const [audio, setAudio] = useState<boolean>(isAudioEnabled())
  const [quality, setQualityState] = useState<Quality>(getQuality())
  const [fullscreen, setFullscreen] = useState<boolean>(isFullscreen())

  useEffect(() => subscribeAudio(setAudio), [])
  useEffect(() => subscribeQuality(setQualityState), [])
  useEffect(() => subscribeFullscreen(setFullscreen), [])

  return (
    <>
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
    </>
  )
}
