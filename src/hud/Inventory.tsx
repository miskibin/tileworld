import { useEffect, useRef, useState } from 'react'
import { getGold, subscribeGold } from '../world/playerStore'
import {
  getInventory,
  subscribeInventory,
  selectSlot,
  activateSlot,
  ITEM_DEFS,
  HOTBAR_SIZE,
  type ItemDef,
} from '../world/inventoryStore'

const BUFF_LABEL: Record<string, string> = { resist: 'Resist', power: 'Power', haste: 'Haste' }

/** One-line stat summary for the hover/scroll popup. */
function statLine(def: ItemDef): string {
  if (def.kind === 'weapon') return `+${def.damageBonus} attack`
  if (def.kind === 'armor') return `−${Math.round((def.defense ?? 0) * 100)}% damage taken`
  const parts: string[] = []
  if (def.heal) parts.push(`+${def.heal} HP`)
  if (def.buff) parts.push(`${BUFF_LABEL[def.buff.kind] ?? def.buff.kind} ${Math.round(def.buff.durationMs / 1000)}s`)
  return parts.join(' · ') || 'No effect'
}

export function Inventory() {
  const [gold, setGold] = useState(getGold())
  const [, force] = useState(0)
  // Stats popup: shows the selected item's stats for a couple seconds whenever
  // the selection actually changes (scroll wheel / number key / click), then
  // fades. Driven from the store callback (vs an effect) so it only fires on a
  // real selection change — not on every gold tick or on mount.
  const [popupOpen, setPopupOpen] = useState(false)
  const selRef = useRef(getInventory().selected)
  useEffect(() => subscribeGold(setGold), [])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const unsub = subscribeInventory(() => {
      force((n) => (n + 1) % 1_000_000)
      const sel = getInventory().selected
      if (sel !== selRef.current) {
        selRef.current = sel
        setPopupOpen(true)
        clearTimeout(timer)
        timer = setTimeout(() => setPopupOpen(false), 2200)
      }
    })
    return () => {
      unsub()
      clearTimeout(timer)
    }
  }, [])

  const inv = getInventory()
  const selSlot = inv.slots[inv.selected]
  const selDef = selSlot?.itemId ? ITEM_DEFS[selSlot.itemId] : null

  return (
    <div className="hotbar">
      {popupOpen && selDef && (
        <div className="hotbar-popup">
          <span className="hotbar-popup-icon">{selDef.icon}</span>
          <span className="hotbar-popup-name">{selDef.name}</span>
          <span className="hotbar-popup-stat">{statLine(selDef)}</span>
        </div>
      )}
      <div className="hotbar-gold">{gold} ★</div>
      <div className="hotbar-slots">
        {Array.from({ length: HOTBAR_SIZE }).map((_, i) => {
          const slot = inv.slots[i]
          const def = slot.itemId ? ITEM_DEFS[slot.itemId] : null
          const equipped =
            (def?.kind === 'weapon' && inv.equippedId === def.id) ||
            (def?.kind === 'armor' && inv.equippedArmorId === def.id)
          return (
            <button
              key={i}
              className={`hotbar-slot ${i === inv.selected ? 'is-selected' : ''} ${equipped ? 'is-equipped' : ''}`}
              onClick={() => selectSlot(i)}
              onContextMenu={(e) => {
                e.preventDefault()
                activateSlot(i)
              }}
              title={
                def
                  ? def.kind === 'consumable'
                    ? `${def.name} — E / right-click to use`
                    : `${def.name} — select or E to equip`
                  : 'Empty'
              }
            >
              <span className="hotbar-key">{i + 1}</span>
              {def && <span className="hotbar-icon">{def.icon}</span>}
              {def && slot.count > 1 && <span className="hotbar-count">{slot.count}</span>}
            </button>
          )
        })}
      </div>
      <div className="hotbar-hint">1–6 / scroll select · E use/equip</div>
    </div>
  )
}
