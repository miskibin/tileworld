import { useEffect, useState } from 'react'
import { findSpawnNear } from './obstacles'
import { createAnimal, getAnimals, resetAnimals, type AnimalState } from './animalStore'
import type { AnimalSpecies } from './animalConfig'
import { WolfView } from './Wolf'
import { DeerView } from './Deer'
import { BoarView } from './Boar'
import { RabbitView } from './Rabbit'

// Wild animal population. Mirrors Bears(): register on the first frame, render
// the right view per species from the shared animalStore. Positions auto-snap
// to valid land via findSpawnNear.

const ANIMAL_SPAWNS: { species: AnimalSpecies; pos: [number, number]; seed: number }[] = [
  // Wolf packs prowling the wilds
  { species: 'wolf', pos: [16, 22], seed: 1.2 },
  { species: 'wolf', pos: [19, 24], seed: 2.4 },
  { species: 'wolf', pos: [14, 26], seed: 3.6 },
  { species: 'wolf', pos: [98, 58], seed: 4.8 },
  { species: 'wolf', pos: [101, 61], seed: 6.0 },
  { species: 'wolf', pos: [96, 63], seed: 7.2 },
  { species: 'wolf', pos: [44, 74], seed: 8.4 },
  { species: 'wolf', pos: [47, 72], seed: 9.6 },
  // Deer herds grazing the open ground
  { species: 'deer', pos: [30, 40], seed: 1.5 },
  { species: 'deer', pos: [33, 42], seed: 2.7 },
  { species: 'deer', pos: [28, 44], seed: 3.9 },
  { species: 'deer', pos: [64, 68], seed: 5.1 },
  { species: 'deer', pos: [67, 66], seed: 6.3 },
  { species: 'deer', pos: [92, 28], seed: 7.5 },
  { species: 'deer', pos: [95, 31], seed: 8.7 },
  { species: 'deer', pos: [58, 76], seed: 9.9 },
  // Rabbits scattered widely
  { species: 'rabbit', pos: [50, 40], seed: 1.1 },
  { species: 'rabbit', pos: [54, 44], seed: 2.2 },
  { species: 'rabbit', pos: [60, 50], seed: 3.3 },
  { species: 'rabbit', pos: [40, 34], seed: 4.4 },
  { species: 'rabbit', pos: [70, 58], seed: 5.5 },
  { species: 'rabbit', pos: [84, 40], seed: 6.6 },
  { species: 'rabbit', pos: [26, 50], seed: 7.7 },
  { species: 'rabbit', pos: [100, 70], seed: 8.8 },
  // Lone boars
  { species: 'boar', pos: [22, 60], seed: 1.3 },
  { species: 'boar', pos: [80, 34], seed: 4.6 },
  { species: 'boar', pos: [60, 80], seed: 7.9 },
  { species: 'boar', pos: [108, 52], seed: 10.2 },
]

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
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      resetAnimals()
      setAnimals(
        ANIMAL_SPAWNS.map((s) => {
          const p = findSpawnNear(s.pos[0], s.pos[1])
          return createAnimal(s.species, p.x, p.z, s.seed)
        }),
      )
    })
    return () => {
      cancelAnimationFrame(handle)
      resetAnimals()
    }
  }, [])
  void getAnimals
  return (
    <group>
      {animals.map((a) => (
        <AnimalView key={a.id} state={a} />
      ))}
    </group>
  )
}
