import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Leva } from 'leva'
import { World } from './world/World'
import { Hud } from './hud/Hud'
import { CAPTURE_MODE } from './world/renderMode'
import { getRunId, subscribeRun } from './world/runStore'

export default function App() {
  // Remount the whole scene when a run restarts (Play Again / Return to Menu).
  // resetRun() wipes the stores; bumpRun() bumps this key so every entity
  // component re-seeds against the clean state — an in-memory restart with no
  // page reload. The HUD lives outside the key so toasts/panels don't flicker.
  const [runId, setRunId] = useState<number>(getRunId())
  useEffect(() => subscribeRun(setRunId), [])

  return (
    <div className="app-root">
      {/* Explicit leva mount (dev only) so capture-mode screenshots hide the
          debug panel. Without this, leva auto-injects on first useControls. */}
      {import.meta.env.DEV && <Leva hidden={CAPTURE_MODE} />}
      <Canvas
        // Capture mode (?capture) drops the soft-shadow pass. dpr STARTS at 1 in
        // BOTH modes: the post stack is fragment-bound, so its cost scales with
        // dpr² — on a high-DPI display [1,1.5] rendered up to 2.25× the pixels,
        // the dominant cost in the perf profile. 1 is the ceiling; AdaptiveResolution
        // (World) scales it BELOW 1 under sustained load and restores it on recovery.
        // The composer's SMAA pass keeps edges clean at 1×.
        shadows={CAPTURE_MODE ? false : 'soft'}
        dpr={1}
        gl={{
          // No MSAA on the canvas: in normal play the EffectComposer renders the
          // final image through its own SMAA pass, so context-level MSAA is pure
          // wasted work (it antialiases a buffer the composer discards). Capture
          // mode has no composer and also wants the cheap path. Either way: off.
          antialias: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.AgXToneMapping,
          toneMappingExposure: 1.15,
        }}
        camera={{ position: [36, 40, 40], fov: 32 }}
        onCreated={({ gl }) => {
          // THE fix for the multi-second freezes while exploring. Shaders compile
          // lazily the first time new content (a biome, a structure, a material
          // variant) renders. three's default `debug.checkShaderErrors = true`
          // calls getProgramInfoLog after every link — a SYNCHRONOUS GPU readback
          // that stalls the main thread ~0.5–1.3s per program (the profile showed
          // 12s of it, with single 7s blocking tasks). Off in production lets the
          // driver compile asynchronously (KHR_parallel_shader_compile) with no
          // stall; kept on in dev so genuine shader errors still surface.
          gl.debug.checkShaderErrors = import.meta.env.DEV
        }}
      >
        {/* Fallback clear colour — the <Sky> dome covers this once mounted. */}
        <color attach="background" args={['#cfd8e2']} />
        <World key={runId} />
      </Canvas>
      <Hud />
    </div>
  )
}
