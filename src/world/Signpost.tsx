import * as THREE from 'three'

// Wayfinder signpost for the castle gate approach: a post with plank arms, each
// tipped with a tiny 3D biome glyph and pointing the REAL grid-world direction
// to that biome — a wordless onboarding nudge for "where do I go today?". No
// drei <Text> (so it mounts in the headless inspector); no point lights (glyphs
// are plain matte). Authored around the local origin, base on y=0; mount with
// rotation 0 so the arms' local axes line up with grid world axes.

const WOOD = '#6b4a2a'
const WOOD_DARK = '#4a3322'

const POST_MAT = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 1, flatShading: true })
const PLANK_MAT = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 1, flatShading: true })

// Biome glyph palette.
const ROCK = new THREE.MeshStandardMaterial({ color: '#8a8f98', roughness: 1, flatShading: true })
const REED = new THREE.MeshStandardMaterial({ color: '#5f7d3a', roughness: 1, flatShading: true })
const SNOW = new THREE.MeshStandardMaterial({ color: '#dfe8ef', roughness: 0.7, flatShading: true })
const SAND = new THREE.MeshStandardMaterial({ color: '#d9b878', roughness: 1, flatShading: true })
const LEAF = new THREE.MeshStandardMaterial({ color: '#3f7d3a', roughness: 1, flatShading: true })
const TRUNK = new THREE.MeshStandardMaterial({ color: '#5a3d22', roughness: 1, flatShading: true })

const POST_H = 2.0

// Y-rotation that maps the arm's local +x onto a grid-world heading. For a
// Y-rotation, local +x → world (cos θ, 0, −sin θ); with +x = East and −z =
// North, these aim each arm at its biome (see CLAUDE.md REGIONS layout).
const E = 0 // rock highlands (East)
const NE = Math.PI / 4 // desert (North-East)
const N_W = (3 * Math.PI) / 4 // snow (North-West)
const W = Math.PI // forest (West)
const S = -Math.PI / 2 // swamp (South)

/** One glyph perched on the far end of an arm (local +x). */
function Glyph({ kind }: { kind: 'rock' | 'swamp' | 'snow' | 'desert' | 'forest' }) {
  switch (kind) {
    case 'rock':
      return (
        <mesh position={[0.84, 0.12, 0]} rotation={[0.3, 0.5, 0.2]} castShadow material={ROCK}>
          <boxGeometry args={[0.18, 0.18, 0.18]} />
        </mesh>
      )
    case 'swamp':
      // A little reed bundle — three thin blades.
      return (
        <group position={[0.84, 0.16, 0]}>
          <mesh position={[0, 0, 0]} castShadow material={REED}>
            <boxGeometry args={[0.04, 0.34, 0.04]} />
          </mesh>
          <mesh position={[0.07, -0.02, 0.04]} rotation={[0, 0, 0.25]} castShadow material={REED}>
            <boxGeometry args={[0.04, 0.3, 0.04]} />
          </mesh>
          <mesh position={[-0.07, -0.02, -0.03]} rotation={[0, 0, -0.2]} castShadow material={REED}>
            <boxGeometry args={[0.04, 0.28, 0.04]} />
          </mesh>
        </group>
      )
    case 'snow':
      return (
        <mesh position={[0.84, 0.14, 0]} castShadow material={SNOW}>
          <octahedronGeometry args={[0.14]} />
        </mesh>
      )
    case 'desert':
      return (
        <mesh position={[0.84, 0.13, 0]} castShadow material={SAND}>
          <coneGeometry args={[0.16, 0.24, 4]} />
        </mesh>
      )
    case 'forest':
      // Tiny pine: trunk + foliage cone.
      return (
        <group position={[0.84, 0.06, 0]}>
          <mesh position={[0, 0.06, 0]} castShadow material={TRUNK}>
            <cylinderGeometry args={[0.03, 0.03, 0.12, 6]} />
          </mesh>
          <mesh position={[0, 0.24, 0]} castShadow material={LEAF}>
            <coneGeometry args={[0.13, 0.28, 7]} />
          </mesh>
        </group>
      )
  }
}

const ARMS: Array<{ kind: 'rock' | 'swamp' | 'snow' | 'desert' | 'forest'; dir: number; y: number }> = [
  { kind: 'rock', dir: E, y: 1.78 },
  { kind: 'desert', dir: NE, y: 1.62 },
  { kind: 'snow', dir: N_W, y: 1.46 },
  { kind: 'forest', dir: W, y: 1.3 },
  { kind: 'swamp', dir: S, y: 1.14 },
]

interface Props {
  position?: [number, number, number]
  rotation?: number
}

export function Signpost({ position = [0, 0, 0], rotation = 0 }: Props) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Foot rocks the post is wedged into. */}
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow material={PLANK_MAT}>
        <boxGeometry args={[0.42, 0.16, 0.42]} />
      </mesh>
      {/* Post. */}
      <mesh position={[0, POST_H / 2, 0]} castShadow receiveShadow material={POST_MAT}>
        <boxGeometry args={[0.14, POST_H, 0.14]} />
      </mesh>
      {/* Directional arms, each a plank reaching out along its biome heading with
          a pointed tip + a glyph on the end. */}
      {ARMS.map((a, i) => (
        <group key={i} position={[0, a.y, 0]} rotation={[0, a.dir, 0]}>
          <mesh position={[0.45, 0, 0]} castShadow receiveShadow material={PLANK_MAT}>
            <boxGeometry args={[0.7, 0.16, 0.1]} />
          </mesh>
          {/* Arrow tip. */}
          <mesh position={[0.86, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow material={PLANK_MAT}>
            <coneGeometry args={[0.1, 0.16, 4]} />
          </mesh>
          <Glyph kind={a.kind} />
        </group>
      ))}
    </group>
  )
}
