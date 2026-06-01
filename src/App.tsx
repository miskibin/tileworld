import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { World } from './world/World'
import { Hud } from './hud/Hud'
import { CAPTURE_MODE } from './world/renderMode'

export default function App() {
  return (
    <div className="app-root">
      <Canvas
        // Capture mode (?capture) drops the soft-shadow pass. dpr is pinned to 1
        // in BOTH modes: the post stack is fragment-bound, so its cost scales with
        // dpr² — on a high-DPI display [1,1.5] rendered up to 2.25× the pixels,
        // the dominant cost in the perf profile. Pinning dpr=1 is the single
        // biggest GPU win; the composer's SMAA pass keeps edges clean at 1×.
        shadows={CAPTURE_MODE ? false : 'soft'}
        dpr={1}
        gl={{
          // No MSAA on the canvas: in normal play the EffectComposer renders the
          // final image through its own SMAA pass, so context-level MSAA is pure
          // wasted work (it antialiases a buffer the composer discards). Capture
          // mode has no composer and also wants the cheap path. Either way: off.
          antialias: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        camera={{ position: [36, 40, 40], fov: 32 }}
      >
        {/* Fallback clear colour — the <Sky> dome covers this once mounted. */}
        <color attach="background" args={['#cfd8e2']} />
        <World />
      </Canvas>
      <Hud />
    </div>
  )
}
