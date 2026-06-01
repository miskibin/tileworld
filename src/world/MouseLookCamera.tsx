import { useEffect, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { PlayerStateRef } from './Character'
import { CENTER_X, CENTER_Z } from './tileMap'
import { isShopOpen, subscribeShop } from './shopStore'
import { isTreeOpen, subscribeTree } from './townHallStore'
import { isPaused, subscribePaused } from './pauseStore'
import { getShake } from './fxStore'
import { isAltHeld } from './inputModifiers'

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
  // 10% closer default than the old 12 — scroll alone now drives the hotbar,
  // so zoom moved onto Alt+scroll (see onWheel).
  const dist = useRef(10.8)
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
    // Zoom is Alt+scroll now; plain scroll cycles the hotbar (HotbarInput).
    // Alt is keyboard-tracked because the wheel event's own altKey is unreliable
    // on Windows; some setups also convert Alt+wheel to a horizontal delta, so
    // fall back to deltaX when deltaY is zero.
    const onWheel = (e: WheelEvent) => {
      if (!e.altKey && !isAltHeld()) return
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
    el.addEventListener('wheel', onWheel, { passive: true })
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
  })

  return null
}
