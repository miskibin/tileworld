import { useEffect, useRef, useState } from 'react'
import { subscribeWarming } from '../world/warmupStore'
import { CAPTURE_MODE } from '../world/renderMode'

const FADE_MS = 480
// Hard ceiling so the cover can never get stuck if the warm-up never reports done
// (e.g. a failed HDRI fetch). Comfortably past the warm-up's own ~3s HDRI wait.
const SAFETY_MS = 9000

/**
 * Opaque cover shown while ShaderWarmup compiles programs at load (and on a
 * restart remount). The warm-up sweeps the camera top-down over the whole island
 * to force the real render path to link every shader — without this cover that
 * sweep is visible behind the menu as a jarring perspective jump before the menu
 * vista settles. We hold the cover until warming ends, then fade to reveal the
 * settled title shot. Lives in the HUD (outside the run-keyed World), so it
 * survives remounts and re-covers each restart's re-warm.
 */
export function LoadingScreen() {
  const seen = useRef(false)
  const [show, setShow] = useState(!CAPTURE_MODE)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const unsub = subscribeWarming((warming) => {
      if (warming) {
        seen.current = true
        setLeaving(false)
        setShow(true)
      } else if (seen.current) {
        setLeaving(true)
      }
    })
    const safety = setTimeout(() => setLeaving(true), SAFETY_MS)
    return () => {
      unsub()
      clearTimeout(safety)
    }
  }, [])

  // Unmount after the fade-out finishes.
  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setShow(false), FADE_MS)
    return () => clearTimeout(t)
  }, [leaving])

  if (!show) return null

  return (
    <div className={'loading-screen' + (leaving ? ' is-leaving' : '')}>
      <div className="loading-inner">
        <div className="loading-kicker">A LOW-POLY ADVENTURE</div>
        <div className="loading-title">TILEWORLD</div>
        <div className="loading-spinner" aria-hidden="true" />
        <div className="loading-text">Forging the realm…</div>
      </div>
    </div>
  )
}
