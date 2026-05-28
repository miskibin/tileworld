import { useEffect, useState } from 'react'
import { getGold, subscribeGold } from '../world/playerStore'

export function Inventory() {
  const [gold, setGold] = useState(getGold())
  useEffect(() => subscribeGold(setGold), [])

  return (
    <div className="inv-panel">
      <div className="inv-header">
        <div className="inv-title">INVENTORY</div>
        <div className="inv-gold">{gold} ★</div>
      </div>
      <div className="inv-grid">
        <div className="inv-slot">⚔</div>
        <div className="inv-slot">🛡</div>
        <div className="inv-slot">⛑</div>
        <div className="inv-slot">
          🧪<span className="count">3</span>
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="inv-slot" />
        ))}
      </div>
    </div>
  )
}
