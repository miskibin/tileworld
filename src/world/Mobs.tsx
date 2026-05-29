import { useEffect, useState } from 'react'
import { getOrks, resetOrks, type OrkState } from './orkStore'
import { resetObjectiveTotal } from './objectiveStore'
import { OrkView } from './Ork'

export function Mobs() {
  // Re-render once on mount so OrkCamps that registered orks during mount get displayed.
  // After that, OrkView reads state directly each frame.
  const [orks, setOrks] = useState<OrkState[]>([])

  useEffect(() => {
    // One frame later — by then all OrkCamps have run their createOrk effects.
    const handle = requestAnimationFrame(() => {
      setOrks([...getOrks()])
    })
    return () => {
      cancelAnimationFrame(handle)
      // Reset on unmount so HMR + remount don't double-register.
      resetOrks()
      resetObjectiveTotal()
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
