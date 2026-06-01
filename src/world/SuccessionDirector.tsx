import { useEffect, useRef } from 'react'
import { subscribePhase, getPhase, type GamePhase } from './gameStore'
import { createVillager } from './villagerStore'
import { HOUSE_SLOTS, slotGroundY } from './cityPlan'
import { resetGraves } from './successionStore'

// Dawn ritual for the "Blade Passes" mechanic. When a wave is repelled the
// clock eases from night back to day (see DayNight.tsx) — that dawn is when the
// town buries its dead (graves persist on the field) and is reborn: one new
// villager joins, slowly replenishing the pool of lives the player spends by
// dying. Null component: just a phase subscription, no scene output.

// Heirs the town starts with, so the very first wave already has a pool of
// lives behind the hero (the lone hamlet villager isn't enough to read).
const STARTING_HEIRS = 3

let birthCount = 0

function birthVillagerAtDawn(): void {
  // Anchor the newcomer to a house slot near the keep so they fold into the
  // normal villager routine (and help defend). Rotate through the slots.
  const slot = HOUSE_SLOTS[birthCount % HOUSE_SLOTS.length]
  birthCount += 1
  createVillager({
    x: slot.doorX,
    y: slotGroundY(slot.doorX, slot.doorZ),
    z: slot.doorZ,
    facing: slot.rotation + Math.PI,
    homeX: slot.x,
    homeZ: slot.z,
    gardenX: slot.doorX,
    gardenZ: slot.doorZ,
    doorX: slot.doorX,
    doorZ: slot.doorZ,
    seed: 0.611 + birthCount * 1.77,
    paletteIndex: birthCount % 3,
  })
}

export function SuccessionDirector() {
  const prev = useRef<GamePhase>(getPhase())
  useEffect(() => {
    const unsub = subscribePhase((p) => {
      // Game start (menu → prep): seed the founding townsfolk.
      if (prev.current === 'menu' && p === 'prep') {
        for (let i = 0; i < STARTING_HEIRS; i++) birthVillagerAtDawn()
      }
      // wave → prep means a wave was just cleared: dawn breaks, a child is born.
      if (prev.current === 'wave' && p === 'prep') birthVillagerAtDawn()
      prev.current = p
    })
    return () => {
      unsub()
      resetGraves()
      birthCount = 0
    }
  }, [])
  return null
}
