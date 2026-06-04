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
  const chipRef = useRef<HTMLDivElement>(null)
  // Live HP mirrored into refs for the rAF loop, plus the lagging "chip" value
  // that trails behind after a hit and drains toward the real HP.
  const hpRef = useRef(PLAYER_MAX_HP)
  const maxHpRef = useRef(PLAYER_MAX_HP)
  const chipValRef = useRef(PLAYER_MAX_HP)
  const lastTickRef = useRef(0)

  useEffect(() => {
    return subscribeHp((curr, max, isDead) => {
      setHp(curr)
      setMaxHp(max)
      setDead(isDead)
      hpRef.current = curr
      maxHpRef.current = max
      // A gain (heal / respawn / max-hp bump) snaps the chip up instantly; only
      // damage leaves a trailing band to drain.
      if (curr >= chipValRef.current) chipValRef.current = curr
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
      // Drain the damage chip toward the real HP — held briefly by the slow
      // rate so the lost slice flashes pale before collapsing onto the bar.
      if (chipRef.current) {
        const now = performance.now() * 0.001
        const dt = lastTickRef.current ? Math.min(0.1, now - lastTickRef.current) : 0
        lastTickRef.current = now
        const max = maxHpRef.current || 1
        const live = hpRef.current
        if (chipValRef.current > live) {
          chipValRef.current = Math.max(live, chipValRef.current - max * 0.6 * dt)
        } else {
          chipValRef.current = live
        }
        chipRef.current.style.width = `${Math.max(0, (chipValRef.current / max) * 100)}%`
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
            <div ref={chipRef} className="hp-bar-chip" />
            <div className="hp-bar-fill" style={{ width: `${ratio * 100}%` }} />
            <div className="hp-bar-text">
              {Math.round(hp)} / {Math.round(maxHp)}
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
