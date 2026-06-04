import { playVoice, isVoicePlaying } from '../audio/audio'

// Central hero-voice gate. Every spoken hero line — the biome musings AND the
// event hints (first stone, night warning, low health, …) — routes through
// sayHeroLine so the man never talks over himself, never rattles two lines back
// to back, and (by default) says each thing only once per run. One module-level
// store, matching the rest of the codebase; no React state.

const spoken = new Set<string>()
let lastAt = -Infinity
const GLOBAL_GAP = 14 // seconds — minimum gap between ANY two hero lines

function nowSec(): number {
  return (typeof performance !== 'undefined' ? performance.now() : 0) * 0.001
}

export interface SayOpts {
  /** never repeat this key in a run (default true) */
  once?: boolean
  /** min seconds since the last hero line (default GLOBAL_GAP) */
  minGap?: number
}

/**
 * Speak a hero line if allowed. Returns true if it was started.
 * Gates: not while another line is playing, not within `minGap` of the last
 * line, and (when `once`) not if this key already played this run. If the clip
 * fails to load — e.g. the line hasn't been recorded yet — the reservation is
 * rolled back so a later trigger can try again.
 */
export function sayHeroLine(key: string, url: string, opts: SayOpts = {}): boolean {
  const once = opts.once ?? true
  const minGap = opts.minGap ?? GLOBAL_GAP
  if (once && spoken.has(key)) return false
  if (isVoicePlaying()) return false
  const t = nowSec()
  if (t - lastAt < minGap) return false

  const prevLastAt = lastAt
  lastAt = t
  if (once) spoken.add(key)
  void playVoice(url).then((ok) => {
    if (!ok) {
      // Nothing actually played (muted, or clip missing) — undo the reservation.
      // Only roll back the gap clock if no later line has reserved since (else we
      // 'd clobber its timestamp and let the next line fire inside the min-gap).
      if (once) spoken.delete(key)
      if (lastAt === t) lastAt = prevLastAt
    }
  })
  return true
}

/** True once any wilderness (non-home) biome line has played — gates the 'home'
 *  line so it doesn't fire at spawn, only after the hero has actually roamed. */
export function wildernessSpoken(): boolean {
  for (const k of spoken) if (k.startsWith('biome:') && k !== 'biome:grass') return true
  return false
}

/** Wipe spoken history (new game / world unmount). */
export function resetHeroVoice(): void {
  spoken.clear()
  lastAt = -Infinity
}
