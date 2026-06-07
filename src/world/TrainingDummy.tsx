import * as THREE from 'three'

// A practice dummy for the castle muster yards. Two looks share one body:
//  - plain: a straw-stuffed cross-post target — hit it to drill the swing.
//  - pell (quintain): the post also carries a pivoting arm (a padded club on the
//    front, a sandbag counterweight on the back) that the live MusterYard view
//    swings on a timer so the player can drill the right-click block. Pass
//    `armRef` to drive that pivot.
//
// Authored around the local origin with the base on y=0; the parent group
// supplies grid-coord placement. Materials are passed in (so the live view can
// flash the straw on a hit) but default to a shared module set so the model
// mounts standalone in the headless inspector.

const WOOD = '#6b4a2a'
const WOOD_DARK = '#4a3322'
const STRAW = '#cdae5e'
const BURLAP = '#b39a72'
const PAD = '#7a5a3a'

export interface DummyMats {
  wood: THREE.MeshStandardMaterial
  woodDark: THREE.MeshStandardMaterial
  straw: THREE.MeshStandardMaterial
  burlap: THREE.MeshStandardMaterial
  pad: THREE.MeshStandardMaterial
}

export function makeDummyMats(): DummyMats {
  return {
    wood: new THREE.MeshStandardMaterial({ color: WOOD, roughness: 1, flatShading: true }),
    woodDark: new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 1, flatShading: true }),
    // Tiny emissive so the live view can punch a hit-flash by raising emissiveIntensity.
    straw: new THREE.MeshStandardMaterial({
      color: STRAW,
      roughness: 1,
      flatShading: true,
      emissive: STRAW,
      emissiveIntensity: 0,
    }),
    burlap: new THREE.MeshStandardMaterial({ color: BURLAP, roughness: 1, flatShading: true }),
    pad: new THREE.MeshStandardMaterial({ color: PAD, roughness: 1, flatShading: true }),
  }
}

// Shared default set for standalone mounts (inspector). The live view passes its
// own per-instance set so a hit-flash on one dummy doesn't light up the others.
const DEFAULT_MATS = makeDummyMats()

const POST_H = 0.92
const ARM_Y = 0.8 // pivot height of the quintain arm

interface Props {
  position?: [number, number, number]
  rotation?: number
  isPell?: boolean
  materials?: DummyMats
  armRef?: React.Ref<THREE.Group>
}

export function TrainingDummy({
  position = [0, 0, 0],
  rotation = 0,
  isPell = false,
  materials = DEFAULT_MATS,
  armRef,
}: Props) {
  const m = materials
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Earth/wood foot the post is driven into. */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow material={m.woodDark}>
        <boxGeometry args={[0.36, 0.12, 0.36]} />
      </mesh>
      {/* Central post. */}
      <mesh position={[0, POST_H / 2, 0]} castShadow receiveShadow material={m.wood}>
        <boxGeometry args={[0.09, POST_H, 0.09]} />
      </mesh>
      {/* Cross-arms (the "shoulders" the straw body is lashed to). */}
      <mesh position={[0, 0.72, 0]} castShadow material={m.wood}>
        <boxGeometry args={[0.6, 0.09, 0.09]} />
      </mesh>
      {/* Burlap-wrapped straw torso. */}
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow material={m.burlap}>
        <cylinderGeometry args={[0.17, 0.21, 0.44, 10]} />
      </mesh>
      {/* Straw poking out at the waist + neck. */}
      <mesh position={[0, 0.42, 0]} castShadow material={m.straw}>
        <coneGeometry args={[0.22, 0.1, 8]} />
      </mesh>
      <mesh position={[0, 0.86, 0]} rotation={[Math.PI, 0, 0]} castShadow material={m.straw}>
        <coneGeometry args={[0.17, 0.1, 8]} />
      </mesh>
      {/* Burlap-sack head. */}
      <mesh position={[0, 0.98, 0]} castShadow receiveShadow material={m.burlap}>
        <sphereGeometry args={[0.13, 10, 8]} />
      </mesh>
      {/* Straw arm-tuft caps so the cross-arms read as stuffed sleeves. */}
      <mesh position={[0.3, 0.72, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={m.straw}>
        <coneGeometry args={[0.07, 0.12, 7]} />
      </mesh>
      <mesh position={[-0.3, 0.72, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow material={m.straw}>
        <coneGeometry args={[0.07, 0.12, 7]} />
      </mesh>

      {/* Quintain arm — only on the pell. Pivots about Y (driven by the view via
          armRef). Authored along local X: padded club on +x, sandbag on -x. */}
      {isPell && (
        <group ref={armRef} position={[0, ARM_Y, 0]}>
          <mesh castShadow material={m.wood}>
            <boxGeometry args={[1.0, 0.07, 0.07]} />
          </mesh>
          {/* Padded striking club. */}
          <mesh position={[0.46, 0, 0]} castShadow material={m.pad}>
            <boxGeometry args={[0.18, 0.18, 0.32]} />
          </mesh>
          {/* Sandbag counterweight. */}
          <mesh position={[-0.46, 0, 0]} castShadow material={m.woodDark}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
          </mesh>
        </group>
      )}
    </group>
  )
}
