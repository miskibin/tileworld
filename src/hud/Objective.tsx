import { useEffect, useRef, useState } from 'react'
import { getObjective } from '../world/objectiveStore'
import { getPlayer } from '../world/playerStore'

export function Objective() {
  // Poll the derived objective each frame, but only re-render when the numbers
  // actually change (kills are infrequent) to avoid per-frame React churn.
  const [obj, setObj] = useState(() => getObjective())
  const prev = useRef('')

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const next = getObjective()
      const key = `${next.total}|${next.remaining}|${next.won}`
      if (key !== prev.current) {
        prev.current = key
        setObj(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Release pointer-lock on victory so the cursor is free to click "Play Again".
  useEffect(() => {
    if (obj.won && document.pointerLockElement) document.exitPointerLock()
  }, [obj.won])

  if (obj.total === 0) return null

  if (obj.won) {
    const p = getPlayer()
    return (
      <div className="victory-screen">
        <div className="victory-title">Victory!</div>
        <div className="victory-sub">The orks have been driven from the land.</div>
        <div className="victory-stats">
          <span>Level {p.level}</span>
          <span>{p.gold} ★ gold</span>
          <span>{obj.slain} orks slain</span>
        </div>
        <button className="victory-again" onClick={() => location.reload()}>
          Play Again
        </button>
      </div>
    )
  }

  return (
    <div className="objective-banner">
      <span className="objective-label">Clear the orks</span>
      <span className="objective-count">
        {obj.remaining} / {obj.total} remaining
      </span>
    </div>
  )
}
