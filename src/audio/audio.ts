import * as THREE from 'three'

let listener: THREE.AudioListener | null = null
let enabled = false
const subscribers = new Set<(v: boolean) => void>()
const buffers = new Map<string, Promise<AudioBuffer>>()
const sfxPools = new Map<string, { instances: THREE.Audio[]; idx: number }>()

export function setListener(l: THREE.AudioListener | null): void {
  listener = l
}

export function getListener(): THREE.AudioListener | null {
  return listener
}

export function isEnabled(): boolean {
  return enabled
}

export function subscribeEnabled(fn: (v: boolean) => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function setEnabled(v: boolean): void {
  if (enabled === v) return
  enabled = v
  if (v && listener && listener.context.state === 'suspended') {
    void listener.context.resume()
  }
  subscribers.forEach((fn) => fn(v))
}

export function loadBuffer(url: string): Promise<AudioBuffer> {
  let p = buffers.get(url)
  if (!p) {
    const loader = new THREE.AudioLoader()
    p = loader.loadAsync(url)
    buffers.set(url, p)
  }
  return p
}

export async function playSfx(url: string, volume = 0.6, pitchJitter = 0.15): Promise<void> {
  if (!listener || !enabled) return
  let pool = sfxPools.get(url)
  if (!pool) {
    const buf = await loadBuffer(url)
    pool = { instances: [], idx: 0 }
    for (let i = 0; i < 6; i++) {
      const a = new THREE.Audio(listener)
      a.setBuffer(buf)
      a.setLoop(false)
      pool.instances.push(a)
    }
    sfxPools.set(url, pool)
  }
  const inst = pool.instances[pool.idx]
  pool.idx = (pool.idx + 1) % pool.instances.length
  if (inst.isPlaying) inst.stop()
  inst.setVolume(volume * (0.9 + Math.random() * 0.2))
  inst.setPlaybackRate(1 + (Math.random() * 2 - 1) * pitchJitter)
  inst.play()
}
