import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { findSpawnNear } from './obstacles'
import { createAnimal, getAnimals, reapAnimal, resetAnimals, type AnimalState } from './animalStore'
import type { AnimalSpecies } from './animalConfig'
import { isFrozen } from './pauseStore'
import { WolfView } from './Wolf'
import { DeerView } from './Deer'
import { BoarView } from './Boar'
import { RabbitView } from './Rabbit'

// Wild animal population. Mirrors Bears(): register on the first frame, render
// the right view per species from the shared animalStore. Positions auto-snap
// to valid land via findSpawnNear.

// Scattered out across the wilds — deliberately kept clear of the player spawn
// ([48,36]) so nothing crowds you on start. A light, lived-in population: small
// deer herds + rabbit clusters in the open, wolf packs at the forest edges,
// lone boars rooting around. Every entry is >=14 tiles from spawn.
type Spawn = { species: AnimalSpecies; pos: [number, number]; seed: number }
const ANIMAL_SPAWNS: Spawn[] = [
  // Deer — a couple grazing the meadows
  { species: 'deer', pos: [30, 40], seed: 1.5 },
  { species: 'deer', pos: [70, 52], seed: 3.9 },
  { species: 'deer', pos: [92, 28], seed: 6.3 },
  // Rabbits — loosely scattered
  { species: 'rabbit', pos: [30, 52], seed: 1.1 },
  { species: 'rabbit', pos: [66, 60], seed: 3.3 },
  { species: 'rabbit', pos: [84, 40], seed: 4.4 },
  // Wolf pair prowling the western forest edge (hunts roaming deer)
  { species: 'wolf', pos: [16, 22], seed: 1.2 },
  { species: 'wolf', pos: [19, 24], seed: 2.4 },
  { species: 'wolf', pos: [98, 58], seed: 3.6 },
  // Lone boars rooting around the wilds
  { species: 'boar', pos: [80, 34], seed: 1.3 },
  { species: 'boar', pos: [22, 60], seed: 2.6 },
]

// Seconds after an animal dies before a fresh one of the same species returns to
// that spawn — keeps the wilds re-populated so the map never empties out.
const RESPAWN_DELAY = 35

// One slot per spawn: which animal currently fills it, and (once it's dead) when
// its replacement is due.
interface Slot {
  def: Spawn
  id: number
  respawnAt: number | null
}

function AnimalView({ state }: { state: AnimalState }) {
  switch (state.species) {
    case 'wolf':
      return <WolfView state={state} />
    case 'deer':
      return <DeerView state={state} />
    case 'boar':
      return <BoarView state={state} />
    case 'rabbit':
      return <RabbitView state={state} />
    default:
      return null
  }
}

export function WildAnimals() {
  const [animals, setAnimals] = useState<AnimalState[]>([])
  const slots = useRef<Slot[]>([])

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      resetAnimals()
      const created = ANIMAL_SPAWNS.map((s) => {
        const p = findSpawnNear(s.pos[0], s.pos[1])
        return createAnimal(s.species, p.x, p.z, s.seed)
      })
      slots.current = ANIMAL_SPAWNS.map((s, i) => ({ def: s, id: created[i].id, respawnAt: null }))
      setAnimals(created)
    })
    return () => {
      cancelAnimationFrame(handle)
      resetAnimals()
      slots.current = []
    }
  }, [])

  // Respawn loop: when a slot's animal is dead, wait out its fade + RESPAWN_DELAY,
  // then reap the corpse and create a fresh animal of the same species at the
  // spawn. The new animal gets a new id, so its view remounts clean.
  useFrame(({ clock }) => {
    if (isFrozen()) return
    const list = slots.current
    if (list.length === 0) return
    const now = clock.getElapsedTime()
    let changed = false
    for (const slot of list) {
      const a = getAnimals().find((x) => x.id === slot.id)
      if (!a || a.hp > 0) {
        slot.respawnAt = null
        continue
      }
      if (slot.respawnAt === null) {
        slot.respawnAt = now + RESPAWN_DELAY
      } else if (now >= slot.respawnAt) {
        reapAnimal(slot.id)
        const p = findSpawnNear(slot.def.pos[0], slot.def.pos[1])
        const fresh = createAnimal(slot.def.species, p.x, p.z, slot.def.seed)
        slot.id = fresh.id
        slot.respawnAt = null
        changed = true
      }
    }
    if (changed) setAnimals(getAnimals().slice())
  })

  return (
    <group>
      {animals.map((a) => (
        <AnimalView key={a.id} state={a} />
      ))}
    </group>
  )
}
