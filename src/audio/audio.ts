import * as THREE from 'three'
import { asset } from '../asset'

let listener: THREE.AudioListener | null = null
let enabled = true
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
  narration: 0.57, // hero's spoken thoughts (biome lines) — kept low under the mix
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
  return buffers.has(asset(url))
}

export function loadBuffer(url: string): Promise<AudioBuffer> {
  // Resolve against the deploy base so absolute "/audio/.." paths work under a
  // sub-path (GitHub Pages /tileworld/). The base-resolved url is the cache key,
  // so hasBuffer() must apply the same transform.
  url = asset(url)
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

// ── Hero narration (spoken biome thoughts) ───────────────────────────────────
// One shared voice node so the hero never talks over himself: a new line stops
// the previous. No pitch jitter (that would warp the voice) and no spatialisation.
let voiceNode: THREE.Audio | null = null
// Bumped on every playVoice; lets a scheduled fade-stop bail if a newer line
// has already taken over the node.
let voiceGen = 0

export async function playVoice(url: string, volume = 1): Promise<boolean> {
  if (!listener || !enabled) return false
  let buf: AudioBuffer
  try {
    buf = await loadBuffer(url)
  } catch {
    return false // clip missing (e.g. line not recorded yet) — caller can retry
  }
  // Re-check after the await — the listener/enable state may have changed.
  if (!listener || !enabled) return false
  if (!voiceNode) voiceNode = new THREE.Audio(listener)
  const gen = ++voiceGen
  if (voiceNode.isPlaying) voiceNode.stop()
  if (gen !== voiceGen) return false // superseded while stopping
  voiceNode.gain.gain.cancelScheduledValues(listener.context.currentTime)
  voiceNode.setBuffer(buf)
  voiceNode.setLoop(false)
  voiceNode.setVolume(volume * audioMix.narration)
  voiceNode.play()
  return true
}

/** True while the hero is speaking a line — used to gate mouth grunts so he
 *  never grunts and talks at once. */
export function isVoicePlaying(): boolean {
  return voiceNode?.isPlaying ?? false
}

/** Fade the current hero line out over ~180ms and stop — used when the player
 *  leaves the biome mid-sentence (soft fade, not a hard mid-word cut), and on
 *  world unmount / new game. */
export function stopVoice(): void {
  if (!voiceNode || !voiceNode.isPlaying) return
  const c = listener?.context
  if (!c) { voiceNode.stop(); return }
  const node = voiceNode
  const gen = voiceGen
  const g = node.gain.gain
  g.cancelScheduledValues(c.currentTime)
  g.setValueAtTime(g.value, c.currentTime)
  g.linearRampToValueAtTime(0.0001, c.currentTime + 0.18)
  window.setTimeout(() => { if (voiceGen === gen && node.isPlaying) node.stop() }, 230)
}
