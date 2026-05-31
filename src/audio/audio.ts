import * as THREE from 'three'

let listener: THREE.AudioListener | null = null
let enabled = false
const subscribers = new Set<(v: boolean) => void>()
const buffers = new Map<string, Promise<AudioBuffer>>()
const sfxPools = new Map<string, { instances: THREE.Audio[]; idx: number }>()

// ── Live audio mix ──────────────────────────────────────────────────────────
// One mutable holder, tuned live from the leva debug panel (DebugBindings).
// The SFX players read these every call; loop volumes (music/ambient) are pushed
// to the running THREE.Audio nodes via applyLoopVolumes().
export const audioMix = {
  sfx: 0.5, // procedural combat tones (hit / swing / kill / hurt)
  voice: 0.6, // sampled creature voices (grunts / roars / barks / meows)
  range: 18, // tiles — creature-voice audible radius around the player
  music: 0.22, // background music loop
  ambient: 0.32, // forest ambient loop
}

let musicNode: THREE.Audio | null = null
let ambientNode: THREE.Audio | null = null
/** SoundScape hands its loop nodes here so the panel can retune them live. */
export function registerLoops(music: THREE.Audio | null, ambient: THREE.Audio | null): void {
  musicNode = music
  ambientNode = ambient
}
/** Push the current music/ambient mix values onto the running loops. */
export function applyLoopVolumes(): void {
  musicNode?.setVolume(audioMix.music)
  ambientNode?.setVolume(audioMix.ambient)
}

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

/** True once a buffer for this url has been requested (and likely loaded). */
export function hasBuffer(url: string): boolean {
  return buffers.has(url)
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
  inst.setVolume(volume * audioMix.voice * (0.9 + Math.random() * 0.2))
  inst.setPlaybackRate(1 + (Math.random() * 2 - 1) * pitchJitter)
  inst.play()
}
