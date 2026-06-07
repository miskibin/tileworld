import { useEffect, useState } from 'react'
import {
  isSettingsOpen,
  closeSettings,
  subscribeSettings,
} from '../world/settingsStore'
import { SettingsControls } from './SettingsControls'

/**
 * The settings overlay used by the StartScreen (the PauseMenu now shows the same
 * controls inline). Lean by design: audio on/off, graphics quality, fullscreen —
 * nothing more. Opening it freezes the world (settingsStore is ORed into
 * isFrozen). Esc closes.
 */
export function SettingsPanel() {
  const [open, setOpen] = useState<boolean>(isSettingsOpen())

  useEffect(() => subscribeSettings(setOpen), [])

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

        <SettingsControls />

        <button className="settings-done" onClick={closeSettings}>
          Done
        </button>
      </div>
    </div>
  )
}
