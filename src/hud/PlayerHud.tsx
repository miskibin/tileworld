import { useEffect, useRef, useState } from 'react'
import { PLAYER_MAX_HP, PLAYER_RESPAWN_DELAY, getPlayer, subscribeHp } from '../world/playerStore'

export function PlayerHud() {
  const [hp, setHp] = useState(PLAYER_MAX_HP)
  const [dead, setDead] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const respawnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return subscribeHp((curr, _max, isDead) => {
      setHp(curr)
      setDead(isDead)
    })
  }, [])

  // Drive the damage-flash overlay via requestAnimationFrame (avoids per-frame React rerenders).
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const p = getPlayer()
      const tNow = performance.now() * 0.001
      const flashRemain = Math.max(0, p.hurtFlashUntil - tNow)
      if (overlayRef.current) {
        overlayRef.current.style.opacity = String(flashRemain * 1.4)
      }
      if (respawnRef.current && p.deadSince !== null) {
        const remain = Math.max(0, PLAYER_RESPAWN_DELAY - (tNow - p.deadSince))
        respawnRef.current.textContent = `Respawn in ${remain.toFixed(1)}s`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const ratio = Math.max(0, hp / PLAYER_MAX_HP)

  return (
    <>
      <div className="hp-bar">
        <div className="hp-bar-fill" style={{ width: `${ratio * 100}%` }} />
        <div className="hp-bar-text">
          {hp} / {PLAYER_MAX_HP}
        </div>
      </div>
      <div ref={overlayRef} className="damage-overlay" />
      {dead && (
        <div className="death-screen">
          <div className="death-title">You Died</div>
          <div ref={respawnRef} className="death-respawn">
            Respawn in {PLAYER_RESPAWN_DELAY.toFixed(1)}s
          </div>
        </div>
      )}
    </>
  )
}
