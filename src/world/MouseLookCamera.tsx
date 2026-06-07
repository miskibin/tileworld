import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { PlayerStateRef } from './Character'
import { CENTER_X, CENTER_Z } from './tileMap'
import { isShopOpen, subscribeShop } from './shopStore'
import { isTreeOpen, subscribeTree } from './townHallStore'
import { isPaused, subscribePaused } from './pauseStore'
import { getPhase } from './gameStore'
import { getShake, getFovKick } from './fxStore'
import { isWarming } from './warmupStore'

interface Props {
  posRef: MutableRefObject<PlayerStateRef>
}

const SENSITIVITY_X = 0.0035
const SENSITIVITY_Y = 0.0014
const ZOOM_SENS = 0.04
const MIN_DIST = 8
const MAX_DIST = 150
const MIN_POLAR = 0.18
const MAX_POLAR = Math.PI / 2 - 0.07
// Resting FOV — MUST match the <Canvas camera={{ fov }}> in App.tsx. Using this
// constant (rather than reading whatever fov is live on the first frame) means the
// load-time ShaderWarmup's wide overview FOV (104) can never be captured as the
// rest value, which used to strand the camera in a permanent wide-angle "fishbowl".
const REST_FOV = 32

// ─── Menu (StartScreen) cinematic camera ────────────────────────────────────
// A dedicated wide vista of the keep (world origin) used ONLY behind the
// StartScreen (phase 'menu'), so gameplay keeps its tuned over-the-shoulder
// follow-cam above. World-anchored (not orbiting the player, which jams the lens
// into the walls/war-bell) with a slow azimuth sway. A wider FOV than gameplay
// makes it read as a grand landscape. Live-tunable in dev:
//   window.__mc = { azimuth, polar, dist, fov, tx, ty, tz }  // any subset
// Hand-tuned to a low, pulled-back vista that looks out across the trees to the
// distant mountain ring — "forest with a mountain view". Low polar keeps the
// horizon high in frame.
const MENU_FOV = 50
const MENU_TARGET = { x: 6, y: 2.2, z: 3 }
const MENU_AZIMUTH = -4.91
const MENU_POLAR = 0.04
const MENU_DIST = 38
const MENU_DRIFT = 0.09 // ± radians of slow sway
const MENU_DRIFT_SPEED = 0.045

/**
 * Over-the-shoulder orbit camera with pointer-lock controls — moving the
 * mouse rotates the view without needing to hold a button. Click the
 * canvas to engage the lock; press Esc (or open a HUD panel) to release.
 */
export function MouseLookCamera({ posRef }: Props) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const azimuth = useRef(Math.PI * 0.85)
  const polar = useRef(Math.PI * 0.18)
  const dist = useRef(8)
  const locked = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    el.style.cursor = 'crosshair'

    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return
      azimuth.current -= e.movementX * SENSITIVITY_X
      polar.current = Math.max(
        MIN_POLAR,
        Math.min(MAX_POLAR, polar.current + e.movementY * SENSITIVITY_Y),
      )
    }
    const onMouseDown = (e: MouseEvent) => {
      // Don't grab pointer if the click landed on a HUD element.
      const target = e.target as Element | null
      if (target && target.closest('.hud')) return
      if (locked.current) return
      if (isShopOpen() || isPaused() || isTreeOpen()) return
      el.requestPointerLock()
    }
    // ctrl+wheel zooms the camera. The plain wheel is reserved for cycling the
    // hotbar (see Inventory.tsx), so we only act when ctrl is held — otherwise
    // bail and let the Inventory handler cycle the selection. preventDefault on
    // a non-passive listener also stops Tauri/browser ctrl+wheel page-zoom. Some
    // setups convert the wheel to a horizontal delta, so fall back to deltaX
    // when deltaY is zero.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX
      dist.current = Math.max(
        MIN_DIST,
        Math.min(MAX_DIST, dist.current + delta * ZOOM_SENS),
      )
    }
    const onLockChange = () => {
      locked.current = document.pointerLockElement === el
    }

    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('pointerlockchange', onLockChange)

    // Release pointer lock automatically when a HUD panel opens.
    const unsubShop = subscribeShop((s) => {
      if (s && document.pointerLockElement === el) document.exitPointerLock()
    })
    const unsubPaused = subscribePaused((p) => {
      if (p && document.pointerLockElement === el) document.exitPointerLock()
    })
    // Release the mouse when the Town Hall upgrade tree opens, so the cursor is
    // free to click nodes without pressing Esc first.
    const unsubTree = subscribeTree((open) => {
      if (open && document.pointerLockElement === el) document.exitPointerLock()
    })

    return () => {
      el.style.cursor = ''
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('wheel', onWheel)
      document.removeEventListener('pointerlockchange', onLockChange)
      unsubShop()
      unsubPaused()
      unsubTree()
    }
  }, [gl])

  useFrame(() => {
    // Yield the camera to ShaderWarmup ONLY behind the StartScreen (phase 'menu'),
    // its one legitimate window. Once the player is playing, take the camera back
    // even if `isWarming()` is erroneously still true — otherwise a stuck warm-up
    // flag would freeze the camera at the far overview with zoom dead.
    if (isWarming() && getPhase() === 'menu') return

    // Behind the StartScreen: a wide world-anchored vista of the keep instead of
    // the gameplay follow-cam. Returns early so mouse-look/shake/FOV-kick never
    // touch the menu shot, and leaves the orbit refs at their gameplay rest values.
    if (getPhase() === 'menu') {
      const o = (typeof window !== 'undefined' && (window as { __mc?: Record<string, number> }).__mc) || undefined
      const t = performance.now() * 0.001
      const a = (o?.azimuth ?? MENU_AZIMUTH) + Math.sin(t * MENU_DRIFT_SPEED) * MENU_DRIFT
      const p = o?.polar ?? MENU_POLAR
      const r = o?.dist ?? MENU_DIST
      const mx = o?.tx ?? MENU_TARGET.x
      const my = o?.ty ?? MENU_TARGET.y
      const mz = o?.tz ?? MENU_TARGET.z
      camera.position.set(
        mx + Math.sin(a) * Math.cos(p) * r,
        my + Math.sin(p) * r,
        mz + Math.cos(a) * Math.cos(p) * r,
      )
      camera.lookAt(mx, my, mz)
      const mcam = camera as THREE.PerspectiveCamera
      if (mcam.isPerspectiveCamera) {
        const fov = o?.fov ?? MENU_FOV
        if (Math.abs(mcam.fov - fov) > 0.01) {
          mcam.fov = fov
          mcam.updateProjectionMatrix()
        }
      }
      return
    }

    const tx = posRef.current.x - CENTER_X
    const ty = posRef.current.y + 1
    const tz = posRef.current.z - CENTER_Z
    const a = azimuth.current
    const p = polar.current
    const r = dist.current
    // Combat shake: jitter the camera with a quick random offset, folded into
    // the single position write below.
    const shake = getShake(performance.now() * 0.001)
    const sx = shake > 0 ? (Math.random() * 2 - 1) * shake : 0
    const sy = shake > 0 ? (Math.random() * 2 - 1) * shake : 0
    const sz = shake > 0 ? (Math.random() * 2 - 1) * shake : 0

    camera.position.set(
      tx + Math.sin(a) * Math.cos(p) * r + sx,
      ty + Math.sin(p) * r + sy,
      tz + Math.cos(a) * Math.cos(p) * r + sz,
    )
    camera.lookAt(tx, ty, tz)

    // FOV punch: widen a few degrees off a hit/kill/landing, ease back to rest.
    // Only touches the projection when it actually moved, so a settled camera
    // pays nothing.
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera
      // Rest FOV is the known Canvas constant + the transient hit/kill/landing kick,
      // so a leaked warm-up FOV can never become the resting value.
      const target = REST_FOV + getFovKick(performance.now() * 0.001)
      if (Math.abs(cam.fov - target) > 0.01) {
        cam.fov = target
        cam.updateProjectionMatrix()
      }
    }
  })

  return null
}
