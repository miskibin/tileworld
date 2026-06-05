import { useEffect, useState } from 'react'
import { getGold, subscribeGold } from '../world/playerStore'
import { getStone, subscribeResources } from '../world/resourceStore'
import {
  subscribeInventory,
  getFoodSlot,
  getBuffSlot,
  eatFood,
  activateBuff,
  ITEM_DEFS,
} from '../world/inventoryStore'
import { isFrozen } from '../world/pauseStore'
import type { BuffKind } from '../world/buffStore'

// The always-on quick-use bar (bottom center) — the only persistent inventory
// chrome. One Food slot (Q) and three buff slots (Z/X/C), each a *view* of the
// next matching item in the bag: use one and the next surfaces automatically.
// Empty slots dim to a faded category icon. Clicking a slot triggers the same
// action as its key. Everything else (equipping, browsing) lives in the
// I-key inventory panel.

// Faded fallback icon shown when a slot has nothing to use.
const FALLBACK: Record<'food' | BuffKind, string> = {
  food: '🍖',
  resist: '🛡️',
  power: '⚔️',
  haste: '💨',
}

export function QuickBar() {
  const [gold, setGold] = useState(getGold())
  const [stone, setStone] = useState(getStone())
  const [, force] = useState(0)
  useEffect(() => subscribeGold(setGold), [])
  useEffect(() => subscribeResources((r) => setStone(r.stone)), [])
  useEffect(() => subscribeInventory(() => force((n) => (n + 1) % 1_000_000)), [])

  const slots: { key: string; kind: 'food' | BuffKind; use: () => void }[] = [
    { key: 'Q', kind: 'food', use: eatFood },
    { key: 'Z', kind: 'resist', use: () => activateBuff('resist') },
    { key: 'X', kind: 'power', use: () => activateBuff('power') },
    { key: 'C', kind: 'haste', use: () => activateBuff('haste') },
  ]

  return (
    <div className="quickbar">
      <div className="quickbar-gold">
        {gold} ★{stone > 0 && <span className="quickbar-stone"> · {stone} 🪨</span>}
      </div>
      <div className="quickbar-slots">
        {slots.map(({ key, kind, use }) => {
          const slot = kind === 'food' ? getFoodSlot() : getBuffSlot(kind)
          const def = slot ? ITEM_DEFS[slot.itemId] : null
          return (
            <button
              key={key}
              className={`quick-slot ${def ? '' : 'is-empty'}`}
              disabled={!def}
              onClick={() => {
                if (!isFrozen()) use()
              }}
              title={def ? def.name : `No ${kind} ready`}
            >
              <span className="quick-key">{key}</span>
              <span className="quick-icon">{def ? def.icon : FALLBACK[kind]}</span>
              {slot && slot.count > 1 && <span className="quick-count">{slot.count}</span>}
            </button>
          )
        })}
      </div>
      <div className="quickbar-hint">Q eat · Z/X/C buffs · I open inventory</div>
    </div>
  )
}
