import { useEffect, useRef, useState } from 'react'
import { getActiveBuffs, subscribeBuffs, type BuffKind } from '../world/buffStore'

// Buff pips — one per active buff (icon + a shrinking duration bar). Renders
// nothing when no buff is active, so there's no idle HUD chrome. Re-renders only
// when a buff is applied/expires (subscribe); the duration bar is driven by
// requestAnimationFrame, not React state, to avoid per-frame churn (PlayerHud pattern).

const ICON: Record<BuffKind, string> = { resist: '🛡️', power: '⚔️', haste: '💨' }
const LABEL: Record<BuffKind, string> = { resist: 'Resist', power: 'Power', haste: 'Haste' }
// Full duration per kind (ms) — matches inventoryStore item defs, for the bar ratio.
const FULL_MS: Record<BuffKind, number> = { resist: 12000, power: 12000, haste: 12000 }

export function BuffBar() {
  const [kinds, setKinds] = useState<BuffKind[]>([])
  const barRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Re-render the pip set on apply/expire.
  useEffect(() => {
    const sync = () => setKinds(getActiveBuffs(performance.now() * 0.001).map((b) => b.kind))
    sync()
    return subscribeBuffs(sync)
  }, [])

  // Drive the shrinking bars + prune expired pips via rAF. Only runs while at
  // least one pip is shown — with no buffs the loop never starts (no idle rAF),
  // and applying a buff updates `kinds` via the subscription, restarting it.
  useEffect(() => {
    if (kinds.length === 0) return
    let raf = 0
    const tick = () => {
      const now = performance.now() * 0.001
      const active = getActiveBuffs(now)
      const activeKinds = active.map((b) => b.kind)
      // Prune when a buff expires (keeps the list in sync without a per-frame setState).
      if (activeKinds.length !== kinds.length) setKinds(activeKinds)
      for (const b of active) {
        const el = barRefs.current[b.kind]
        if (el) el.style.width = `${Math.min(100, (b.remain * 1000 / FULL_MS[b.kind]) * 100)}%`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [kinds])

  if (kinds.length === 0) return null

  return (
    <div className="buff-bar">
      {kinds.map((k) => (
        <div key={k} className="buff-pip" title={LABEL[k]}>
          <span className="buff-icon">{ICON[k]}</span>
          <div className="buff-dur">
            <div className="buff-dur-fill" ref={(el) => { barRefs.current[k] = el }} />
          </div>
        </div>
      ))}
    </div>
  )
}
