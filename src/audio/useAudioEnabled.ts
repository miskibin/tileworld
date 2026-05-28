import { useEffect, useState } from 'react'
import { isEnabled, subscribeEnabled } from './audio'

export function useAudioEnabled(): boolean {
  const [v, setV] = useState<boolean>(isEnabled())
  useEffect(() => subscribeEnabled(setV), [])
  return v
}
