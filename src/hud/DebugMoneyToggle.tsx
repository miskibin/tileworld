import { useEffect, useState } from 'react'
import { isUnlimitedMoney, setUnlimitedMoney, subscribeUnlimitedMoney } from '../world/debugStore'

/** Debug cheat button: toggle unlimited money to test every upgrade node. (F8) */
export function DebugMoneyToggle() {
  const [on, setOn] = useState<boolean>(isUnlimitedMoney())

  useEffect(() => subscribeUnlimitedMoney(setOn), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F8') {
        e.preventDefault()
        setUnlimitedMoney(!isUnlimitedMoney())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <button
      type="button"
      className={`debug-toggle debug-money${on ? ' is-on' : ''}`}
      onClick={() => setUnlimitedMoney(!on)}
      title={on ? 'Unlimited money ON (F8)' : 'Unlimited money OFF (F8)'}
      aria-label="Toggle unlimited money debug cheat"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M14.5 9a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.8 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2A2.5 2.5 0 0 1 9.5 15" />
        <path d="M12 6v1.5M12 16.5V18" />
      </svg>
    </button>
  )
}
