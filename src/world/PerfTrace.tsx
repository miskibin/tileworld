import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { getOrks, getAliveOrks } from './orkStore'
import { getGraves } from './successionStore'
import { getWave } from './waveStore'

// Dev-only perf tracer. The headless preview throttles timers, so the "degrades
// over time" report can only be diagnosed from a real, foreground session. This
// logs growth metrics vs FPS every few seconds; if geometries/textures/meshes/
// subscribers climb monotonically while FPS falls, that's the leak. Mounted only
// under import.meta.env.DEV (see World.tsx); delete that line to disable.
//
// Usage: open DevTools console (F12), play ~2 minutes through a wave or two,
// then copy the `[perf]` lines (or run `copy(JSON.stringify(window.__perf))`).

interface PerfRow {
  t: number
  fps: number
  calls: number
  tris: number
  geo: number
  tex: number
  progs: number
  meshes: number
  casters: number
  subs: number
  orks: number
  alive: number
  graves: number
  wave: number
}

export function PerfTrace() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const internal = useThree((s) => s.internal)
  const frames = useRef(0)
  const last = useRef(performance.now())

  useFrame(() => {
    frames.current++
  })

  useEffect(() => {
    const log: PerfRow[] = []
    ;(window as unknown as { __perf: PerfRow[] }).__perf = log
    const iv = setInterval(() => {
      const now = performance.now()
      const dt = Math.max(0.001, (now - last.current) / 1000)
      const fps = +(frames.current / dt).toFixed(1)
      frames.current = 0
      last.current = now

      let meshes = 0
      let casters = 0
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          meshes++
          if (o.castShadow) casters++
        }
      })

      const row: PerfRow = {
        t: Math.round(now / 1000),
        fps,
        calls: gl.info.render.calls,
        tris: gl.info.render.triangles,
        geo: gl.info.memory.geometries,
        tex: gl.info.memory.textures,
        progs: gl.info.programs?.length ?? 0,
        meshes,
        casters,
        subs: internal.subscribers.length,
        orks: getOrks().length,
        alive: getAliveOrks().length,
        graves: getGraves().length,
        wave: getWave().index + 1,
      }
      log.push(row)
      // eslint-disable-next-line no-console
      console.log('[perf]', JSON.stringify(row))
    }, 3000)
    return () => clearInterval(iv)
  }, [gl, scene, internal])

  return null
}
