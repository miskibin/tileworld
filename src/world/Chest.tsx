import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { isPaused } from './pauseStore'
import { isShopOpen } from './shopStore'
import { getPlayer, addGold } from './playerStore'
import { addItem, bagHasRoomFor } from './inventoryStore'
import { spawnFloat } from './fxStore'
import { playChestOpen } from '../audio/sfx'
import { sayHeroLine } from './voiceStore'
import { findSpawnNear } from './obstacles'
import { tileAt, tileTopY } from './tileMap'

export type ChestVariant = 'default' | 'snow' | 'desert' | 'swamp' | 'rock' | 'forest'

interface ChestProps {
  position: [number, number, number]
  rotation?: number
  /** items granted when opened (item ids from ITEM_DEFS) */
  loot?: string[]
  /** gold granted when opened */
  gold?: number
  /** biome recolor of the wood + metal (and a small accent). Default = brown+gold. */
  variant?: ChestVariant
  /** headless inspector flag — omits the drei <Text> (troika can't mount headless) */
  inspect?: boolean
}

interface VariantStyle {
  wood: string // main planks
  woodDark: string // bands / corner staves
  iron: string // bracket + lock metal
  lock: string // hasp / latch highlight metal (emissive-ish, toneMapped off)
  accent?: string // small biome accent dab (moss, frost, sand) — optional
}

// Per-variant palette. Only a handful of chests exist, so per-instance
// materials (built from the chosen style, memoized below) are fine.
const VARIANT_STYLE: Record<ChestVariant, VariantStyle> = {
  default: { wood: '#7a4a24', woodDark: '#5a3418', iron: '#b8b8c0', lock: '#e0b04a' },
  snow: { wood: '#b9c2cc', woodDark: '#8b97a3', iron: '#cdd6df', lock: '#dfe9f2', accent: '#eaf2f8' },
  desert: { wood: '#c8a45e', woodDark: '#9c7a3c', iron: '#caa86a', lock: '#e8c764', accent: '#d8c9a0' },
  swamp: { wood: '#46402c', woodDark: '#2c281a', iron: '#7a6a4a', lock: '#9aa05a', accent: '#5d7a3a' },
  rock: { wood: '#6f6f73', woodDark: '#4a4a4e', iron: '#3c3c40', lock: '#9a9aa0', accent: '#56565a' },
  forest: { wood: '#6e4a2a', woodDark: '#4a301a', iron: '#9a7a44', lock: '#caa050', accent: '#5d7a3a' },
}

const INTERACT_DIST = 2.2

// ---- Dimensions (chunky game chest) ---------------------------------------
// Body: a solid box resting with its base flush on y=0.
const BODY_W = 0.86
const BODY_D = 0.58
const BODY_H = 0.40
const BODY_CY = BODY_H / 2 // body sits with base on y=0

// Lid: ONE clean low-dome — a flat slab the full footprint, plus a smaller
// "cap" slab on top so the silhouette reads as a slightly trapezoidal/domed
// lid (not splayed planks). The lid group's origin is the back-top hinge edge;
// every lid part is authored in +z (toward the front) and +y (upward) from it.
const LID_BASE_H = 0.10 // thickness of the flat lid slab
const LID_CAP_H = 0.10 // thickness of the raised cap on top
const LID_CAP_INSET = 0.10 // how far the cap is inset from the slab edges (per side)
const LID_H = LID_BASE_H + LID_CAP_H // total lid height above the body top

const HINGE_Y = BODY_H // lid pivots at the back-top edge of the body
const HINGE_Z = -BODY_D / 2

const CORNER_T = 0.07 // corner iron stave thickness
const BAND_T = 0.018 // iron band thickness (stands proud of the wood)

export function Chest({
  position,
  rotation = 0,
  loot = [],
  gold = 0,
  variant = 'default',
  inspect = false,
}: ChestProps) {
  // Snap to valid land so chests placed in the expanded coastline can't float
  // on water. Resolved once from the requested spot.
  const pos = useMemo<[number, number, number]>(() => {
    const s = findSpawnNear(position[0], position[2])
    const tile = tileAt(Math.floor(s.x), Math.floor(s.z))
    return [s.x, tile ? tileTopY(Math.floor(s.x), Math.floor(s.z)) : position[1], s.z]
  }, [position])

  // Per-instance materials built from the variant style (memoized per variant).
  const mats = useMemo(() => {
    const s = VARIANT_STYLE[variant] ?? VARIANT_STYLE.default
    return {
      wood: new THREE.MeshStandardMaterial({ color: s.wood, roughness: 0.9, flatShading: true }),
      woodDark: new THREE.MeshStandardMaterial({ color: s.woodDark, roughness: 1, flatShading: true }),
      iron: new THREE.MeshStandardMaterial({ color: s.iron, roughness: 0.5, metalness: 0.7, flatShading: true }),
      lock: new THREE.MeshStandardMaterial({ color: s.lock, roughness: 0.5, metalness: 0.6, toneMapped: false }),
      accent: s.accent
        ? new THREE.MeshStandardMaterial({ color: s.accent, roughness: 1, flatShading: true })
        : null,
    }
  }, [variant])

  const lidRef = useRef<THREE.Group>(null!)
  const promptRef = useRef<THREE.Group>(null!)
  const inRange = useRef(false)
  const [opened, setOpened] = useState(false)
  const lidAngle = useRef(0)

  useFrame(() => {
    if (isPaused()) return
    const p = getPlayer()
    const near = Math.hypot(p.x - pos[0], p.z - pos[2]) < INTERACT_DIST
    inRange.current = near
    if (promptRef.current) promptRef.current.visible = near && !opened && !isShopOpen()

    // Animate the lid opening (ease toward target angle). Pivot is the back-top
    // edge so the curved lid swings up and back without clipping the body.
    const target = opened ? -Math.PI * 0.6 : 0
    lidAngle.current += (target - lidAngle.current) * 0.15
    if (lidRef.current) lidRef.current.rotation.x = lidAngle.current
  })

  // F to open when in range.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF' || opened || !inRange.current || isShopOpen() || isPaused()) return
      // Don't open (and lose the loot) if the bag can't hold it all — leave the
      // chest closed + retryable and tell the player to make room first.
      if (!bagHasRoomFor(loot)) {
        spawnFloat('Bag full!', '#ff9a9a', pos[0], pos[1] + 1.6, pos[2])
        return
      }
      setOpened(true)
      playChestOpen()
      sayHeroLine('chest', '/audio/vo/chest.mp3', { once: false })
      if (gold > 0) {
        addGold(gold)
        spawnFloat(`+${gold} ★`, '#ffd58c', pos[0], pos[1] + 1.6, pos[2])
      }
      loot.forEach((id, i) => {
        addItem(id)
        spawnFloat('+1 item', '#9be88a', pos[0] + (i - loot.length / 2) * 0.4, pos[1] + 1.2 + i * 0.3, pos[2])
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opened, gold, loot, pos])

  return (
    <group position={pos} rotation={[0, rotation, 0]}>
      {/* ---- Body (solid box, base flush on y=0) ---- */}
      <mesh position={[0, BODY_CY, 0]} castShadow receiveShadow material={mats.wood}>
        <boxGeometry args={[BODY_W, BODY_H, BODY_D]} />
      </mesh>
      {/* Horizontal iron band wrapping the body (front/back faces proud) */}
      <mesh position={[0, BODY_H * 0.45, 0]} material={mats.iron}>
        <boxGeometry args={[BODY_W + BAND_T, 0.05, BODY_D + BAND_T]} />
      </mesh>

      {/* Corner iron staves on the four vertical edges of the body */}
      {(
        [
          [-BODY_W / 2 + CORNER_T / 2, -BODY_D / 2 + CORNER_T / 2],
          [BODY_W / 2 - CORNER_T / 2, -BODY_D / 2 + CORNER_T / 2],
          [-BODY_W / 2 + CORNER_T / 2, BODY_D / 2 - CORNER_T / 2],
          [BODY_W / 2 - CORNER_T / 2, BODY_D / 2 - CORNER_T / 2],
        ] as const
      ).map(([cx, cz], i) => (
        <mesh key={i} position={[cx, BODY_CY, cz]} castShadow material={mats.iron}>
          <boxGeometry args={[CORNER_T, BODY_H, CORNER_T]} />
        </mesh>
      ))}

      {/* Front lock plate (fixed to the body, top-front face, where the hasp meets it) */}
      <mesh position={[0, BODY_H - 0.06, BODY_D / 2 + 0.012]} castShadow material={mats.iron}>
        <boxGeometry args={[0.18, 0.12, 0.025]} />
      </mesh>
      {/* Keyhole stud on the lock plate */}
      <mesh position={[0, BODY_H - 0.085, BODY_D / 2 + 0.028]} material={mats.lock}>
        <boxGeometry args={[0.05, 0.05, 0.02]} />
      </mesh>

      {/* ---- Lid — ONE clean low dome, pivots at the back-top hinge edge ----
          Origin (group) is the back-top edge of the body (y=BODY_H, z=-BODY_D/2).
          Closed (rot.x=0): the flat slab sits flush on the body top and spans
          z 0..BODY_D. Open (rot.x≈-0.6π) the whole group swings up and back as
          a rigid unit, so every child (cap, bands, hasp) moves with it — nothing
          detaches. */}
      <group ref={lidRef} position={[0, HINGE_Y, HINGE_Z]}>
        {/* Flat lid slab — full footprint, sits flush on the body top */}
        <mesh position={[0, LID_BASE_H / 2, BODY_D / 2]} castShadow receiveShadow material={mats.wood}>
          <boxGeometry args={[BODY_W, LID_BASE_H, BODY_D]} />
        </mesh>
        {/* Raised cap slab — inset all round, giving a trapezoidal dome profile */}
        <mesh
          position={[0, LID_BASE_H + LID_CAP_H / 2, BODY_D / 2]}
          castShadow
          receiveShadow
          material={mats.wood}
        >
          <boxGeometry args={[BODY_W - LID_CAP_INSET * 2, LID_CAP_H, BODY_D - LID_CAP_INSET * 2]} />
        </mesh>

        {/* Two iron bands running front-to-back over the lid (left & right),
            stepping up and over the cap so they hug the dome profile. */}
        {[-BODY_W * 0.28, BODY_W * 0.28].map((bx, i) => (
          <group key={i}>
            {/* over the slab shoulders (front + back of the cap) */}
            <mesh position={[bx, LID_BASE_H + BAND_T / 2, BODY_D / 2]} material={mats.iron}>
              <boxGeometry args={[0.05, BAND_T, BODY_D]} />
            </mesh>
            {/* over the cap top */}
            <mesh position={[bx, LID_H + BAND_T / 2, BODY_D / 2]} material={mats.iron}>
              <boxGeometry args={[0.05, BAND_T, BODY_D - LID_CAP_INSET * 2]} />
            </mesh>
          </group>
        ))}

        {/* Hinge barrels at the back-top edge (the rotation axis itself) */}
        {[-BODY_W * 0.32, BODY_W * 0.32].map((hx, i) => (
          <mesh key={i} position={[hx, 0, 0.01]} rotation={[0, 0, Math.PI / 2]} castShadow material={mats.iron}>
            <cylinderGeometry args={[0.035, 0.035, 0.12, 8]} />
          </mesh>
        ))}

        {/* Hasp — CHILD of the lid, hangs off the lid's front face down over the
            lock plate. Sits flush in BOTH states because it swings with the lid.
            Front face of the lid slab is at z=BODY_D; the hasp's back face hugs it. */}
        <mesh position={[0, LID_BASE_H * 0.5, BODY_D + 0.012]} castShadow material={mats.lock}>
          <boxGeometry args={[0.12, LID_BASE_H + 0.06, 0.025]} />
        </mesh>

        {/* Optional small biome accent dab centered on the cap top */}
        {mats.accent && (
          <mesh position={[0, LID_H + 0.012, BODY_D / 2]} material={mats.accent}>
            <boxGeometry args={[(BODY_W - LID_CAP_INSET * 2) * 0.6, 0.022, (BODY_D - LID_CAP_INSET * 2) * 0.6]} />
          </mesh>
        )}
      </group>

      {/* No per-chest point light: ~23 chests each carried one, and any change to
          the gathered NUM_POINT_LIGHTS relinks EVERY lit material (the travel-
          stutter root cause). The lid-open + loot floaters + SFX sell the open. */}

      {/* "Press F" prompt — omitted under the headless inspector (troika <Text>) */}
      {!inspect && (
        <group ref={promptRef} position={[0, 1.1, 0]} visible={false}>
          <Text fontSize={0.2} color="#fff5cc" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.02}>
            Press F to open
          </Text>
        </group>
      )}
    </group>
  )
}
