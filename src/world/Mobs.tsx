import { memo, useEffect, useState } from 'react'
import { getOrks, resetOrks, subscribeOrks, type OrkState } from './orkStore'
import { resetCastle } from './castleStore'
import { resetWaves } from './waveStore'
import { resetTowers } from './towerStore'
import { OrkView } from './Ork'

// Memoized: each spawn/death notifies the roster, which re-renders this whole
// list. Without memo, all ~20 OrkViews (each a ~15-mesh tree) reconcile on every
// spawn/death — a 50–130ms hitch mid-wave. Each ork's `state` object is a stable
// reference (mutated in place), so memo lets unchanged orks skip the re-render;
// only the one that spawned or was reaped reconciles.
const MemoOrkView = memo(OrkView)

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
      resetCastle()
      resetWaves()
      resetTowers()
    }
  }, [])

  return (
    <group>
      {orks.map((o) => (
        <MemoOrkView key={o.id} state={o} />
      ))}
    </group>
  )
}
