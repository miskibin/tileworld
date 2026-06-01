import { useEffect, useState } from 'react'
import { getOrks, resetOrks, subscribeOrks, type OrkState } from './orkStore'
import { resetObjectiveTotal } from './objectiveStore'
import { resetCastle } from './castleStore'
import { resetWaves } from './waveStore'
import { resetTowers } from './towerStore'
import { OrkView } from './Ork'

export function Mobs() {
  // Subscribe to the roster so orks spawned over the course of a wave (and
  // reaped on death) appear/disappear. The list reference is stable; we copy to
  // force a re-render.
  const [orks, setOrks] = useState<OrkState[]>(() => [...getOrks()])

  useEffect(() => {
    const unsub = subscribeOrks((list) => setOrks([...list]))
    return () => {
      unsub()
      // Reset on unmount so HMR + remount don't double-register.
      resetOrks()
      resetObjectiveTotal()
      resetCastle()
      resetWaves()
      resetTowers()
    }
  }, [])

  return (
    <group>
      {orks.map((o) => (
        <OrkView key={o.id} state={o} />
      ))}
    </group>
  )
}
