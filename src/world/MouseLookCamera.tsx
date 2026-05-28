import { useEffect, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { PlayerStateRef } from './Character'
import { CENTER_X, CENTER_Z } from './tileMap'
import { isShopOpen, subscribeShop } from './shopStore'
import { isPaused, subscribePaused } from './pauseStore'

interface Props {
  posRef: MutableRefObject<PlayerStateRef>
}

const SENSITIVITY_X = 0.0035
const SENSITIVITY_Y = 0.0028
const ZOOM_SENS = 0.04
const MIN_DIST = 8
const MAX_DIST = 70
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
  const polar = useRef(Math.PI * 0.32)
  const dist = useRef(30)
  const locked = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    el.style.cursor = 'crosshair'

    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return
      azimuth.current -= e.movementX * SENSITIVITY_X
      polar.current = Math.max(
        MIN_POLAR,
        Math.min(MAX_POLAR, polar.current - e.movementY * SENSITIVITY_Y),
      )
    }
    const onMouseDown = (e: MouseEvent) => {
      // Don't grab pointer if the click landed on a HUD element.
      const target = e.target as Element | null
      if (target && target.closest('.hud')) return
      if (locked.current) return
      if (isShopOpen() || isPaused()) return
      el.requestPointerLock()
    }
    const onWheel = (e: WheelEvent) => {
      dist.current = Math.max(
        MIN_DIST,
        Math.min(MAX_DIST, dist.current + e.deltaY * ZOOM_SENS),
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

    return () => {
      el.style.cursor = ''
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('wheel', onWheel)
      document.removeEventListener('pointerlockchange', onLockChange)
      unsubShop()
      unsubPaused()
    }
  }, [gl])

  useFrame(() => {
    const tx = posRef.current.x - CENTER_X
    const ty = posRef.current.y + 1
    const tz = posRef.current.z - CENTER_Z
    const a = azimuth.current
    const p = polar.current
    const r = dist.current
    camera.position.set(
      tx + Math.sin(a) * Math.cos(p) * r,
      ty + Math.sin(p) * r,
      tz + Math.cos(a) * Math.cos(p) * r,
    )
    camera.lookAt(tx, ty, tz)
  })

  return null
}
