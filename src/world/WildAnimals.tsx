import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { findSpawnNear } from './obstacles'
import { fromBase } from './tileMap'
import { createAnimal, getAnimals, reapAnimal, resetAnimals, type AnimalState } from './animalStore'
import type { AnimalSpecies } from './animalConfig'
import { isFrozen } from './pauseStore'
import { WolfView } from './Wolf'
import { DeerView } from './Deer'
import { BoarView } from './Boar'
import { RabbitView } from './Rabbit'
import { PolarBearView } from './PolarBear'
import { ScorpionView } from './Scorpion'
import { BogCrocView } from './BogCroc'
import { ElkView } from './Elk'
import { GoatView } from './Goat'
import { GolemView } from './Golem'

// Wild animal population. Mirrors Bears(): register on the first frame, render
// the right view per species from the shared animalStore. Positions auto-snap
// to valid land via findSpawnNear.

// Scattered across the wilds in the grass belt + biome edges, kept clear of the
// castle safe-zone (player spawn ~[72,58]) so nothing crowds you on start. A
// light, lived-in population: deer herds + rabbit clusters in the open, wolf
// packs at the forest edges, lone boars rooting around.
type Spawn = { species: AnimalSpecies; pos: [number, number]; seed: number }
// Thinned to 15 (was 27) — wildlife is a big chunk of the scene's Object3D count
// (each creature is a deep mesh tree, the top per-frame scene-graph cost). Keeps
// every biome's signature creature + a thin generic spread + a small forest herd
// for the hunting ground, without wall-to-wall animals stripping the frame budget.
// Authored in base-map coords; scaled onto the enlarged map so each creature
// tracks its (bigger, farther) biome — esp. the golem in the rock highlands.
const BASE_ANIMAL_SPAWNS: Spawn[] = [
  // Deer — grazing the grass belt + the forest herd
  { species: 'deer', pos: [60, 38], seed: 1.5 },
  { species: 'deer', pos: [40, 76], seed: 8.64 },
  // Rabbits — loosely scattered
  { species: 'rabbit', pos: [52, 62], seed: 1.1 },
  { species: 'rabbit', pos: [34, 82], seed: 8.67 },
  // Wolves prowling the forest edges (hunt roaming deer)
  { species: 'wolf', pos: [40, 82], seed: 1.2 },
  { species: 'wolf', pos: [46, 46], seed: 3.6 },
  // A lone boar rooting around the wilds
  { species: 'boar', pos: [92, 72], seed: 1.3 },
  // ─── Biome signature creatures (one per biome) ────────────────
  { species: 'polar_bear', pos: [40, 30], seed: 7.1 },
  { species: 'scorpion', pos: [104, 30], seed: 7.4 },
  { species: 'bog_croc', pos: [72, 86], seed: 8.2 },
  { species: 'goat', pos: [30, 50], seed: 9.1 },
  { species: 'golem', pos: [108, 62], seed: 9.6 }, // rock highlands foot (was mis-placed in the west)
  // Forest (SW ~[32,80]) — a small elk herd keeps the woods a real hunting ground.
  { species: 'elk', pos: [40, 72], seed: 8.5 },
  { species: 'elk', pos: [28, 78], seed: 8.61 },
  { species: 'elk', pos: [36, 84], seed: 8.62 },
  // ─── Extra density for the enlarged map (the big island felt empty) ───
  // Grass belt — deer + rabbits you bump into on any day trip.
  { species: 'deer', pos: [88, 44], seed: 2.2 },
  { species: 'deer', pos: [58, 66], seed: 3.3 },
  { species: 'deer', pos: [92, 62], seed: 4.4 },
  { species: 'rabbit', pos: [60, 44], seed: 5.5 },
  { species: 'rabbit', pos: [86, 50], seed: 6.6 },
  { species: 'rabbit', pos: [50, 58], seed: 7.7 },
  // Forest wood — wolves on the prowl + a bigger elk herd.
  { species: 'wolf', pos: [26, 74], seed: 2.8 },
  { species: 'elk', pos: [44, 88], seed: 8.71 },
  { species: 'boar', pos: [44, 64], seed: 3.1 },
  // Biome signature creatures — a second of each so the wilds aren't bare.
  { species: 'polar_bear', pos: [30, 40], seed: 7.2 },
  { species: 'scorpion', pos: [118, 38], seed: 7.5 },
  { species: 'bog_croc', pos: [66, 86], seed: 8.3 },
  { species: 'goat', pos: [44, 50], seed: 9.2 },
  { species: 'golem', pos: [114, 64], seed: 9.7 }, // second golem, rock highlands
]
const ANIMAL_SPAWNS: Spawn[] = BASE_ANIMAL_SPAWNS.map((s) => {
  const [x, z] = fromBase(s.pos[0], s.pos[1])
  return { ...s, pos: [Math.round(x), Math.round(z)] }
})

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
    case 'polar_bear':
      return <PolarBearView state={state} />
    case 'scorpion':
      return <ScorpionView state={state} />
    case 'bog_croc':
      return <BogCrocView state={state} />
    case 'elk':
      return <ElkView state={state} />
    case 'goat':
      return <GoatView state={state} />
    case 'golem':
      return <GolemView state={state} />
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
