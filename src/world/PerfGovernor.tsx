import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { getPhase } from './gameStore'
import { isFrozen } from './pauseStore'
import { isWarming } from './warmupStore'
import { getQuality, isQualityManual } from './qualityStore'
import {
  decideDowngrade,
  hasSuggestedDowngrade,
  markSuggested,
  median,
} from './perfStore'
import { showNotice } from './noticeStore'

// Frames per measurement window (~3s at 60fps, ~6s at 30fps). Long enough that a
// single hitch doesn't trigger a downgrade.
const WINDOW = 180
// Ignore the first second of live play after a (re)mount — the scene is still
// settling (lazy compiles, lights) and would skew the median low.
const SETTLE = 1.0

/**
 * Logic-only R3F node: samples frame time during live gameplay and asks
 * perfStore whether the frame rate warrants SUGGESTING a lower quality tier. On
 * a yes it fires a one-time toast prompting the player to lower Graphics — it
 * never changes the setting itself. Suggests at most once per run (latched in
 * perfStore, cleared by resetRun) and backs off the moment the player sets
 * quality by hand. No render output.
 */
export function PerfGovernor() {
  const samples = useRef<number[]>([])
  const startedAt = useRef(0)

  useFrame(({ clock }, dt) => {
    // Cheap early-outs: nothing to do once we've suggested or the player chose.
    if (hasSuggestedDowngrade() || isQualityManual()) return

    const phase = getPhase()
    // Only measure live gameplay. Reset the window outside it (menu/end/frozen).
    if (phase !== 'prep' && phase !== 'wave') {
      samples.current.length = 0
      startedAt.current = 0
      return
    }
    if (isFrozen() || isWarming()) return

    const now = clock.getElapsedTime()
    if (startedAt.current === 0) {
      startedAt.current = now
      return
    }
    if (now - startedAt.current < SETTLE) return
    if (dt <= 0) return

    samples.current.push(dt)
    if (samples.current.length < WINDOW) return

    const medFps = 1 / median(samples.current)
    samples.current.length = 0

    const target = decideDowngrade({
      medianFps: medFps,
      current: getQuality(),
      manual: isQualityManual(),
      alreadySuggested: hasSuggestedDowngrade(),
    })
    if (target) {
      // Suggest only — the player stays in control. Esc opens Settings (Graphics).
      const name = target[0].toUpperCase() + target.slice(1)
      showNotice(`Low frame rate — try ${name} graphics (Esc → Settings)`)
      markSuggested()
    }
  })

  return null
}
