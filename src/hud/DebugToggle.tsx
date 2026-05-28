import { useEffect, useState } from 'react'
import { isShowPaths, setShowPaths, subscribeShowPaths } from '../world/debugStore'

export function DebugToggle() {
  const [on, setOn] = useState<boolean>(isShowPaths())

  useEffect(() => subscribeShowPaths(setOn), [])

  // Hot-key: F9 toggles
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F9') {
        e.preventDefault()
        setShowPaths(!isShowPaths())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <button
      type="button"
      className={`debug-toggle${on ? ' is-on' : ''}`}
      onClick={() => setShowPaths(!on)}
      title={on ? 'Hide AI paths (F9)' : 'Show AI paths (F9)'}
      aria-label="Toggle AI path debug overlay"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="19" r="2" />
        <circle cx="19" cy="5" r="2" />
        <path d="M6.5 17.5 9 14l4 4 4-9" />
      </svg>
    </button>
  )
}
