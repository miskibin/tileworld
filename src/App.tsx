import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { World } from './world/World'
import { Hud } from './hud/Hud'

export default function App() {
  return (
    <div className="app-root">
      <Canvas
        shadows="soft"
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
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
