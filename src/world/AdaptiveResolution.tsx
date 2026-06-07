import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { getPhase } from './gameStore'
import { isFrozen } from './pauseStore'
import { isWarming } from './warmupStore'
import { median } from './perfStore'

// Dynamic resolution scaling. dpr starts at 1 (App.tsx pins it there — going ABOVE
// 1 is the high-DPI cost trap the profile flagged). This drops it BELOW 1 in
// discrete steps when the frame rate sags under load (the whole post stack is
// fragment-bound, so fewer pixels is the broadest GPU win), and steps it back up
// when the frame rate recovers. SMAA still cleans the edges, so a step down reads
// as a slight softening, not jaggies — and it self-restores between waves.
//
// Separate from PerfGovernor (which only SUGGESTS a quality-tier change via a
// one-time toast): this acts automatically, subtly, and reversibly every window.

// dpr ladder, full → softest. 0.72 is the floor — lower starts to look rough even
// with SMAA. Each rung is a clear step so we don't thrash buffers on tiny swings.
const STEPS = [1, 0.85, 0.72]
// Frames per measurement window (~1.5s at 60fps). Long enough to ignore one hitch.
const WINDOW = 90
// Step down below this median FPS, up above the upper bound. The gap between them is
// a deadband so a frame rate sitting mid-range never oscillates.
const FPS_DOWN = 45
const FPS_UP = 58
// Windows to wait after a change before reacting again — lets the new resolution
// settle (and its one buffer realloc pass) before we judge the result.
const COOLDOWN = 2

export function AdaptiveResolution() {
  const setDpr = useThree((s) => s.setDpr)
  const idx = useRef(0)
  const samples = useRef<number[]>([])
  const cooldown = useRef(0)

  // Fresh run → full resolution; re-adapt from there. (The Canvas persists across
  // run remounts, so gl pixel ratio would otherwise carry a downscale into a clean
  // menu.)
  useEffect(() => {
    idx.current = 0
    cooldown.current = 0
    samples.current.length = 0
    setDpr(STEPS[0])
  }, [setDpr])

  useFrame((_, dt) => {
    const phase = getPhase()
    if (phase !== 'prep' && phase !== 'wave') {
      samples.current.length = 0
      return
    }
    if (isFrozen() || isWarming() || dt <= 0) return

    samples.current.push(dt)
    if (samples.current.length < WINDOW) return

    const fps = 1 / median(samples.current)
    samples.current.length = 0

    if (cooldown.current > 0) {
      cooldown.current--
      return
    }

    if (fps < FPS_DOWN && idx.current < STEPS.length - 1) {
      idx.current++
      setDpr(STEPS[idx.current])
      cooldown.current = COOLDOWN
    } else if (fps > FPS_UP && idx.current > 0) {
      idx.current--
      setDpr(STEPS[idx.current])
      cooldown.current = COOLDOWN
    }
  })

  return null
}
