import { useEffect, useState } from 'react'
import { getGold, subscribeGold } from '../world/playerStore'
import {
  getInventory,
  subscribeInventory,
  selectSlot,
  activateSlot,
  ITEM_DEFS,
  HOTBAR_SIZE,
} from '../world/inventoryStore'

export function Inventory() {
  const [gold, setGold] = useState(getGold())
  const [, force] = useState(0)
  useEffect(() => subscribeGold(setGold), [])
  useEffect(() => subscribeInventory(() => force((n) => (n + 1) % 1_000_000)), [])

  const inv = getInventory()

  return (
    <div className="hotbar">
      <div className="hotbar-gold">{gold} ★</div>
      <div className="hotbar-slots">
        {Array.from({ length: HOTBAR_SIZE }).map((_, i) => {
          const slot = inv.slots[i]
          const def = slot.itemId ? ITEM_DEFS[slot.itemId] : null
          const equipped = def?.kind === 'weapon' && inv.equippedId === def.id
          return (
            <button
              key={i}
              className={`hotbar-slot ${i === inv.selected ? 'is-selected' : ''} ${equipped ? 'is-equipped' : ''}`}
              onClick={() => selectSlot(i)}
              onContextMenu={(e) => {
                e.preventDefault()
                activateSlot(i)
              }}
              title={def ? `${def.name} — right-click to ${def.kind === 'weapon' ? 'equip' : 'use'}` : 'Empty'}
            >
              <span className="hotbar-key">{i + 1}</span>
              {def && <span className="hotbar-icon">{def.icon}</span>}
              {def && slot.count > 1 && <span className="hotbar-count">{slot.count}</span>}
            </button>
          )
        })}
      </div>
      <div className="hotbar-hint">1–5 select · right-click use</div>
    </div>
  )
}
