import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { isFrozen } from './pauseStore'
import { cullVisible, isCulled } from './cull'
import { getPlayer } from './playerStore'
import { getBlockState } from './blockStore'
import { spawnImpact } from './impactStore'
import { spawnFloat, addShake } from './fxStore'
import { playHit, playPick } from '../audio/sfx'
import { shiftToCentre } from './tileMap'
import { slotGroundY, CITY_CENTER } from './cityPlan'
import { registerHouseBlocker, resetHouseBlockers } from './houseBlockers'
import { getCity, subscribeCity } from './cityStore'
import { createDummy, resetDummies, type DummyState } from './dummyStore'
import { TrainingDummy, makeDummyMats } from './TrainingDummy'
import { Signpost } from './Signpost'

// The castle muster ground: practice dummies + a wayfinder signpost standing in
// the empty courtyard around the keep, so the start view (a bare keep on grass
// until the upgrade tree builds out) reads as a staging ground. Dummies are hit
// with the normal swing (Character scan → dummyStore); the one pell swings a
// quintain arm so the player can drill the right-click block.
//
// It is TEMPORARY: the moment the player starts building the castle (any wall /
// gate / tower / house / farm), the muster ground is struck — the whole thing
// unmounts and its store + signpost blocker are cleared, freeing the courtyard
// for the real structures. So placements sit INSIDE the wall bounds (already
// scatter-reserved via isInsideCastle); no obstacles.ts entry needed.
//
// Coords are authored in BASE space and translated with the keep (shiftToCentre),
// the same idiom as the other castle-attached props. Mount once inside World's
// offset group; it self-culls per dummy.

interface YardSpec {
  dummies: Array<{ base: [number, number]; seed: number; isPell?: boolean }>
  signpost?: { base: [number, number] }
}

const YARDS: YardSpec[] = [
  // A training ground ringing the keep in the open courtyard: a pell + a plain
  // target flanking the spawn (south), a pair by the north gate, and the
  // wayfinder signpost to the south. All clear of the keep + war bell footprints.
  {
    dummies: [
      { base: [68, 58], seed: 0.2, isPell: true },
      { base: [76, 58], seed: 0.55 },
      { base: [68, 50], seed: 0.36 },
      { base: [76, 50], seed: 0.68 },
    ],
    signpost: { base: [75, 62] },
  },
]

// Pell quintain swing cycle (seconds). A long rest, a clear wind-up telegraph,
// a fast strike (the block window), then a recovery back to rest.
const REST = 3.2
const WINDUP = 0.6
const STRIKE = 0.22
const RECOVER = 0.6
const CYCLE = REST + WINDUP + STRIKE + RECOVER
const STRIKE_START = REST + WINDUP
const STRIKE_END = STRIKE_START + STRIKE
// Arm yaw (about Y): club rests out to the side, winds back, then sweeps to the
// dummy's front (local +z, toward the player) at the strike.
const YAW_REST = 0.6
const YAW_WOUND = 1.4
const YAW_FRONT = -Math.PI / 2
// Player must be within ~2 tiles of the pell to actually get bonked / block it.
const BONK_R2 = 2.0 * 2.0

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
const smooth = (k: number): number => k * k * (3 - 2 * k)

function DummyView({ state }: { state: DummyState }) {
  const groupRef = useRef<THREE.Group>(null!)
  const armRef = useRef<THREE.Group>(null!)
  const mats = useMemo(() => makeDummyMats(), [])
  const baseStrawEmissive = mats.straw.emissiveIntensity
  const [visible, setVisible] = useState(true)
  const struck = useRef(false) // pell: resolved-this-swing edge latch

  // Face the keep, so the player coming out the gate faces the dummy's front
  // (the pell swings its club toward that front).
  const facing = useMemo(
    () => Math.atan2(CITY_CENTER.x - state.x, CITY_CENTER.z - state.z),
    [state.x, state.z],
  )

  useFrame((rf) => {
    if (isFrozen()) return
    const g = groupRef.current
    if (!g) return
    const culled = isCulled(state.x, state.z)
    cullVisible(g, culled)
    if (culled) {
      if (visible) setVisible(false)
      return
    }
    if (!visible) setVisible(true)

    const now = rf.clock.getElapsedTime()

    // Hit feedback: brief straw-flash + a damped recoil wobble.
    const flash = Math.max(0, (state.hurtFlashUntil - now) / 0.18)
    mats.straw.emissiveIntensity = baseStrawEmissive + flash * 0.6
    const w = Math.max(0, (state.wobbleUntil - now) / 0.5)
    g.rotation.z = Math.sin(w * 28) * 0.14 * w

    // Pell quintain: drive the arm + resolve a block check at the strike.
    if (state.isPell && armRef.current) {
      const tc = (((now - state.seed * CYCLE) % CYCLE) + CYCLE) % CYCLE
      let yaw = YAW_REST
      if (tc < REST) {
        yaw = YAW_REST
      } else if (tc < STRIKE_START) {
        yaw = lerp(YAW_REST, YAW_WOUND, smooth((tc - REST) / WINDUP))
      } else if (tc < STRIKE_END) {
        yaw = lerp(YAW_WOUND, YAW_FRONT, smooth((tc - STRIKE_START) / STRIKE))
      } else {
        yaw = lerp(YAW_FRONT, YAW_REST, smooth((tc - STRIKE_END) / RECOVER))
      }
      armRef.current.rotation.y = yaw

      const inStrike = tc >= STRIKE_START && tc < STRIKE_END
      if (inStrike && !struck.current) {
        struck.current = true
        resolveBonk(state)
      } else if (!inStrike) {
        struck.current = false
      }
    }
  })

  if (!visible) return null
  return (
    <group ref={groupRef} position={[state.x, state.y, state.z]} rotation={[0, facing, 0]}>
      <TrainingDummy isPell={state.isPell} materials={mats} armRef={armRef} />
    </group>
  )
}

/** Pell strike landed: clang if the player is guarding, dull thud otherwise.
 *  Harmless either way (no HP) — pure block-timing practice feedback. */
function resolveBonk(state: DummyState): void {
  const p = getPlayer()
  const dx = p.x - state.x
  const dz = p.z - state.z
  if (dx * dx + dz * dz > BONK_R2) return // nobody at the pell — swing whiffs
  const y = state.y + 1.1
  if (getBlockState().blocking) {
    spawnImpact(state.x, y, state.z, { color: '#bfe9ff', count: 10, spread: 3.0, up: 1.4 })
    spawnFloat('Blocked!', '#9adcff', state.x, state.y + 1.9, state.z, 1.3)
    addShake(0.22)
    playPick() // bright metallic clang
  } else {
    spawnImpact(state.x, y, state.z, { color: '#a98c5a', count: 5, spread: 1.8, up: 1.0 })
    spawnFloat('Bonk', '#d8c9a8', state.x, state.y + 1.9, state.z)
    addShake(0.12)
    playHit() // dull thud
  }
}

export function MusterYard() {
  const [city, setCity] = useState(getCity)
  useEffect(() => subscribeCity((s) => setCity({ ...s })), [])
  // Struck once the player starts building the castle proper — any space-taking
  // structure means the courtyard is now in use.
  const castleStarted =
    city.housesBuilt > 0 || city.wallsBuilt || city.gateBuilt || city.towersBuilt || city.farmBuilt

  const [dummies, setDummies] = useState<DummyState[]>([])
  const [signposts, setSignposts] = useState<Array<[number, number, number]>>([])

  useEffect(() => {
    if (castleStarted) {
      // Building has begun — clear the store + signpost blocker so no invisible
      // collider lingers in the courtyard.
      resetDummies()
      resetHouseBlockers('muster')
      setDummies([])
      setSignposts([])
      return
    }
    const handle = requestAnimationFrame(() => {
      resetDummies()
      resetHouseBlockers('muster')
      const created: DummyState[] = []
      const posts: Array<[number, number, number]> = []
      for (const yard of YARDS) {
        for (const d of yard.dummies) {
          const [wx, wz] = shiftToCentre(d.base[0], d.base[1])
          created.push(createDummy(wx, wz, d.seed, d.isPell))
        }
        if (yard.signpost) {
          const [sx, sz] = shiftToCentre(yard.signpost.base[0], yard.signpost.base[1])
          posts.push([sx, slotGroundY(sx, sz), sz])
          // Solid post: pathfinding + player both consult houseBlocksAt.
          registerHouseBlocker({ minX: sx - 0.4, maxX: sx + 0.4, minZ: sz - 0.4, maxZ: sz + 0.4 }, 'muster')
        }
      }
      setDummies(created)
      setSignposts(posts)
    })
    return () => {
      cancelAnimationFrame(handle)
      resetDummies()
      resetHouseBlockers('muster')
    }
  }, [castleStarted])

  if (castleStarted) return null
  return (
    <group>
      {dummies.map((d) => (
        <DummyView key={d.id} state={d} />
      ))}
      {signposts.map((p, i) => (
        <Signpost key={`sp${i}`} position={p} rotation={0} />
      ))}
    </group>
  )
}
