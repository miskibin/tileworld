import { useEffect, useState } from 'react'
import {
  getInventory,
  subscribeInventory,
  setInventoryOpen,
  activateBagItem,
  unequipWeapon,
  unequipArmor,
  itemStatLine,
  ITEM_DEFS,
  type ItemDef,
} from '../world/inventoryStore'
import { getGold, subscribeGold } from '../world/playerStore'

// The openable bag (I key) — a modal that freezes the world like the shop. Two
// equip slots (weapon + armor) on the left, the general bag grid on the right.
// Click a bag item to act on it (eat a consumable, equip a weapon/armor; tokens
// are inert); click an equipped slot to take that gear off. Esc or I closes.

function EquipSlot({ label, def, onUnequip }: { label: string; def: ItemDef | null; onUnequip: () => void }) {
  return (
    <button
      className={`inv-equip-slot ${def ? '' : 'is-empty'}`}
      disabled={!def}
      onClick={onUnequip}
      title={def ? `${def.name} — ${itemStatLine(def)} · click to unequip` : `No ${label.toLowerCase()} equipped`}
    >
      <span className="inv-equip-icon">{def ? def.icon : '—'}</span>
      <span className="inv-equip-text">
        <span className="inv-equip-kind">{label}</span>
        <span className="inv-equip-name">{def ? def.name : 'Empty'}</span>
      </span>
    </button>
  )
}

export function InventoryPanel() {
  const [open, setOpen] = useState(getInventory().open)
  const [, force] = useState(0)
  const [gold, setGold] = useState(getGold())

  useEffect(
    () =>
      subscribeInventory(() => {
        setOpen(getInventory().open)
        force((n) => (n + 1) % 1_000_000)
      }),
    [],
  )
  useEffect(() => subscribeGold(setGold), [])

  // Esc closes the bag (and we stop the global pause handler — it already defers
  // to an open inventory, so this just makes the close feel instant).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        setInventoryOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const inv = getInventory()
  const weaponDef = inv.equippedId ? ITEM_DEFS[inv.equippedId] : null
  const armorDef = inv.equippedArmorId ? ITEM_DEFS[inv.equippedArmorId] : null

  return (
    <div className="inv-screen">
      <div className="inv-card">
        <div className="inv-header">
          <div className="inv-title">INVENTORY</div>
          <div className="inv-gold">{gold} ★</div>
        </div>
        <div className="inv-body">
          <div className="inv-equip">
            <div className="inv-col-label">Equipped</div>
            <EquipSlot label="Weapon" def={weaponDef} onUnequip={unequipWeapon} />
            <EquipSlot label="Armor" def={armorDef} onUnequip={unequipArmor} />
          </div>
          <div className="inv-bag-col">
            <div className="inv-col-label">Bag</div>
            <div className="inv-bag">
              {inv.bag.map((slot, i) => {
                const def = slot.itemId ? ITEM_DEFS[slot.itemId] : null
                return (
                  <button
                    key={i}
                    className={`inv-cell ${def ? '' : 'is-empty'}`}
                    disabled={!def}
                    onClick={() => activateBagItem(i)}
                    title={def ? `${def.name} — ${itemStatLine(def)}` : 'Empty'}
                  >
                    {def && <span className="inv-cell-icon">{def.icon}</span>}
                    {def && slot.count > 1 && <span className="inv-cell-count">{slot.count}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <button className="inv-close" onClick={() => setInventoryOpen(false)}>
          Close (Esc / I)
        </button>
      </div>
    </div>
  )
}
