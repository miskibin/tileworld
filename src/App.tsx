import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { World } from './world/World'
import { Hud } from './hud/Hud'

export default function App() {
  return (
    <div className="app-root">
      <Canvas
        shadows="basic"
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        camera={{ position: [36, 40, 40], fov: 32 }}
      >
        <color attach="background" args={['#0c1220']} />
        <World />
      </Canvas>
      <Hud />
    </div>
  )
}
