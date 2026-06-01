import { useEffect, useRef, useState } from 'react'
import {
  PLAYER_MAX_HP,
  getPlayer,
  subscribeHp,
  subscribeStats,
} from '../world/playerStore'
import { getBlockState } from '../world/blockStore'

export function PlayerHud() {
  const [hp, setHp] = useState(PLAYER_MAX_HP)
  const [maxHp, setMaxHp] = useState(PLAYER_MAX_HP)
  const [dead, setDead] = useState(false)
  const [stats, setStats] = useState({ level: 1, xp: 0, xpToNext: 50 })
  const overlayRef = useRef<HTMLDivElement>(null)
  const levelUpRef = useRef<HTMLDivElement>(null)
  const staminaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return subscribeHp((curr, max, isDead) => {
      setHp(curr)
      setMaxHp(max)
      setDead(isDead)
    })
  }, [])

  useEffect(() => subscribeStats(setStats), [])

  // Drive flashes via requestAnimationFrame (avoids per-frame React rerenders).
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const p = getPlayer()
      const tNow = performance.now() * 0.001
      const flashRemain = Math.max(0, p.hurtFlashUntil - tNow)
      if (overlayRef.current) {
        overlayRef.current.style.opacity = String(flashRemain * 1.4)
      }
      if (levelUpRef.current) {
        const remain = Math.max(0, p.levelUpFlashUntil - tNow)
        levelUpRef.current.style.opacity = String(Math.min(1, remain))
      }
      if (staminaRef.current) {
        const blk = getBlockState()
        staminaRef.current.style.width = `${blk.stamina * 100}%`
        // Locked → red warning, actively blocking → bright, recovering → muted.
        staminaRef.current.style.background = blk.locked
          ? 'linear-gradient(180deg, #e0623a 0%, #a02a1f 100%)'
          : blk.blocking
            ? 'linear-gradient(180deg, #bcd4ff 0%, #6a9be0 100%)'
            : 'linear-gradient(180deg, #8fa8c8 0%, #4a6690 100%)'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const ratio = Math.max(0, hp / maxHp)
  const xpRatio = stats.xpToNext > 0 ? Math.min(1, stats.xp / stats.xpToNext) : 0

  return (
    <>
      <div className="vitals">
        <div className="level-badge">Lv {stats.level}</div>
        <div className="bars">
          <div className="hp-bar">
            <div className="hp-bar-fill" style={{ width: `${ratio * 100}%` }} />
            <div className="hp-bar-text">
              {hp} / {maxHp}
            </div>
          </div>
          <div className="xp-bar">
            <div className="xp-bar-fill" style={{ width: `${xpRatio * 100}%` }} />
            <div className="xp-bar-text">
              XP {stats.xp} / {stats.xpToNext}
            </div>
          </div>
          <div className="stamina-bar" title="Shield (hold right-click)">
            <div ref={staminaRef} className="stamina-bar-fill" />
          </div>
        </div>
      </div>
      <div ref={overlayRef} className="damage-overlay" />
      <div ref={levelUpRef} className="levelup-flash">
        Level Up!
      </div>
      {dead && (
        <div className="death-screen">
          <div className="death-title">You Fell</div>
          <div className="death-respawn">The blade passes…</div>
        </div>
      )}
    </>
  )
}
