import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { World } from './world/World'
import { Hud } from './hud/Hud'
import { CAPTURE_MODE } from './world/renderMode'

export default function App() {
  return (
    <div className="app-root">
      <Canvas
        // Capture mode (?capture) drops the soft-shadow pass and pins dpr to 1
        // so a software-WebGL frame is cheap enough for the headless screenshot
        // tool to grab within its timeout. See renderMode.ts.
        shadows={CAPTURE_MODE ? false : 'soft'}
        dpr={CAPTURE_MODE ? 1 : [1, 1.5]}
        gl={{
          antialias: !CAPTURE_MODE,
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
