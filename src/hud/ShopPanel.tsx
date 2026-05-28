import { useEffect, useState } from 'react'
import { getActiveShop, subscribeShop, closeShop } from '../world/shopStore'
import { getGold, subscribeGold } from '../world/playerStore'

export function ShopPanel() {
  const [shop, setShop] = useState(getActiveShop())
  const [gold, setGold] = useState(getGold())
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => subscribeShop(setShop), [])
  useEffect(() => subscribeGold(setGold), [])

  // Esc closes shop. Stop the global pause-menu handler from firing too —
  // it's harmless if both run, the shop closes either way.
  useEffect(() => {
    if (!shop) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        closeShop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shop])

  if (!shop) return null

  return (
    <div className="shop-screen">
      <div className="shop-card">
        <div className="shop-header">
          <div className="shop-title">{shop.title}</div>
          <div className="shop-gold">{gold} ★</div>
        </div>
        <div className="shop-items">
          {shop.items.map((it) => {
            const canAfford = gold >= it.price
            return (
              <button
                key={it.id}
                className={`shop-item ${canAfford ? '' : 'is-poor'}`}
                disabled={!canAfford}
                onClick={() => {
                  const ok = it.apply()
                  if (ok) {
                    setFlash(it.id)
                    setTimeout(() => setFlash(null), 600)
                  }
                }}
              >
                <span className="shop-item-icon">{it.icon}</span>
                <span className="shop-item-name">{it.name}</span>
                <span className="shop-item-price">{it.price} ★</span>
                {flash === it.id && <span className="shop-item-pop">+</span>}
              </button>
            )
          })}
        </div>
        <button className="shop-close" onClick={() => closeShop()}>Leave (Esc)</button>
      </div>
    </div>
  )
}
