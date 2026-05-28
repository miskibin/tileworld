import { useEffect, useState } from 'react'
import { isEnabled, setEnabled, subscribeEnabled } from '../audio/audio'

export function AudioToggle() {
  const [on, setOn] = useState<boolean>(isEnabled())
  useEffect(() => subscribeEnabled(setOn), [])

  return (
    <button
      type="button"
      className="audio-toggle"
      onClick={() => setEnabled(!on)}
      title={on ? 'Mute audio' : 'Enable audio'}
      aria-label={on ? 'Mute audio' : 'Enable audio'}
    >
      {on ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4z" />
          <path d="M22 9l-6 6" />
          <path d="M16 9l6 6" />
        </svg>
      )}
    </button>
  )
}
