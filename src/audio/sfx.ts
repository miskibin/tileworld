import { getListener, isEnabled, playSfx } from './audio'

// Procedurally-synthesized SFX via WebAudio — no asset files needed. All sounds
// reuse the THREE.AudioListener's AudioContext so they share the same enabled/
// resume lifecycle as the music + ambience.

function ctx(): AudioContext | null {
  if (!isEnabled()) return null
  const l = getListener()
  if (!l) return null
  const c = l.context as AudioContext
  if (c.state === 'suspended') void c.resume()
  return c
}

const noiseCache = new WeakMap<AudioContext, AudioBuffer>()
function noiseBuffer(c: AudioContext): AudioBuffer {
  let buf = noiseCache.get(c)
  if (!buf) {
    buf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseCache.set(c, buf)
  }
  return buf
}

/** Quick tone with an attack/decay envelope. */
function tone(
  c: AudioContext,
  type: OscillatorType,
  freq: number,
  t0: number,
  dur: number,
  peak: number,
  endFreq?: number,
): void {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** Filtered noise burst — for swings and impacts. */
function noise(
  c: AudioContext,
  t0: number,
  dur: number,
  peak: number,
  filterType: BiquadFilterType,
  f0: number,
  f1: number,
): void {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  const filter = c.createBiquadFilter()
  filter.type = filterType
  filter.frequency.setValueAtTime(f0, t0)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur)
  filter.Q.value = 1.1
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(g).connect(c.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

/** Sword whoosh — descending band-passed noise sweep. */
export function playSwing(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  noise(c, t, 0.2, 0.12, 'bandpass', 2600, 700)
}

/** Blade-on-flesh impact — noise crack + low thud. */
export function playHit(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  noise(c, t, 0.09, 0.18, 'highpass', 1800, 600)
  tone(c, 'triangle', 180, t, 0.12, 0.14, 70)
}

/** Heavier impact on a kill. */
export function playKill(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  noise(c, t, 0.16, 0.22, 'lowpass', 1400, 250)
  tone(c, 'square', 130, t, 0.2, 0.16, 48)
}

/** Player gets hurt — dull low thud. */
export function playHurt(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(c, 'square', 150, t, 0.18, 0.16, 60)
  noise(c, t, 0.1, 0.08, 'lowpass', 800, 200)
}

/** Coin pickup — two bright ascending blips. */
export function playGold(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(c, 'square', 880, t, 0.08, 0.08)
  tone(c, 'square', 1320, t + 0.06, 0.1, 0.08)
}

/** Level-up — rising arpeggio. */
export function playLevelUp(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  notes.forEach((f, i) => tone(c, 'triangle', f, t + i * 0.09, 0.22, 0.13))
}

/** Victory fanfare — triad swell. */
export function playVictory(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  const seq = [
    [523.25, 0],
    [659.25, 0.12],
    [783.99, 0.24],
    [1046.5, 0.4],
  ] as const
  seq.forEach(([f, off]) => tone(c, 'triangle', f, t + off, 0.5, 0.14))
}

/** Villager "hmm" — nasal vowel grunt (Minecraft-style murmur). */
export function playVillagerGrunt(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  const f0 = 118 + Math.random() * 46
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(f0, t)
  // Slight up-then-down inflection gives the questioning "hmm?" feel.
  osc.frequency.linearRampToValueAtTime(f0 * 1.12, t + 0.12)
  osc.frequency.linearRampToValueAtTime(f0 * 0.82, t + 0.34)
  const formant = c.createBiquadFilter()
  formant.type = 'bandpass'
  formant.frequency.value = 680
  formant.Q.value = 6
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.15, t + 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36)
  osc.connect(formant).connect(g).connect(c.destination)
  osc.start(t)
  osc.stop(t + 0.4)
}

/** Chest opening — wooden creak + a soft treasure chime. */
export function playChestOpen(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  noise(c, t, 0.22, 0.1, 'bandpass', 500, 240) // creak
  tone(c, 'sine', 784, t + 0.12, 0.18, 0.1)
  tone(c, 'sine', 1175, t + 0.2, 0.24, 0.1)
}

/** Eating/drinking a consumable. */
export function playConsume(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(c, 'sine', 420, t, 0.1, 0.1, 620)
  tone(c, 'sine', 520, t + 0.1, 0.12, 0.1, 760)
}

/** Equipping a weapon — short metallic clink. */
export function playEquip(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(c, 'square', 1320, t, 0.07, 0.08)
  noise(c, t, 0.06, 0.05, 'highpass', 4000, 2000)
}

/** Bear roar — low growl sweep (synth fallback for the sampled clip). */
export function playRoar(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(c, 'sawtooth', 130, t, 0.5, 0.18, 70)
  noise(c, t, 0.45, 0.12, 'lowpass', 700, 200)
}

/** Guttural ork grunt — synth fallback if the sampled clip is unavailable. */
function orkGruntSynth(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  const f0 = 92 + Math.random() * 34
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(f0 * 1.4, t)
  osc.frequency.exponentialRampToValueAtTime(f0, t + 0.18)
  const formant = c.createBiquadFilter()
  formant.type = 'bandpass'
  formant.frequency.value = 520
  formant.Q.value = 4
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.04)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  osc.connect(formant).connect(g).connect(c.destination)
  osc.start(t)
  osc.stop(t + 0.34)
  noise(c, t, 0.16, 0.06, 'lowpass', 900, 300)
}

// ─── Sampled creature voices (CC0 clips in public/audio) ─────────────────────
// rubberduck — "80 CC0 creature SFX" (OpenGameArt, CC0 / public domain).
// Each play is volume-scaled by distance to the player and falls back to a
// synth grunt/roar if the clip fails to load.
const ORK_GRUNTS = ['/audio/ork-grunt-1.ogg', '/audio/ork-grunt-2.ogg', '/audio/ork-grunt-3.ogg']
const ORK_ROAR = '/audio/ork-roar.ogg'
const BEAR_ROAR = '/audio/bear-roar.ogg'
const BEAR_GROWL = '/audio/bear-growl.ogg'

const AUDIBLE_RANGE = 28 // tiles; beyond this a creature voice is silent

function volForDist(dist: number, base: number): number {
  if (dist >= AUDIBLE_RANGE) return 0
  return base * (1 - dist / AUDIBLE_RANGE)
}

/** Ork grunt on aggro/attack — random clip, distance-scaled. */
export function playOrkGrunt(dist = 0): void {
  const v = volForDist(dist, 0.55)
  if (v <= 0) return
  const f = ORK_GRUNTS[(Math.random() * ORK_GRUNTS.length) | 0]
  playSfx(f, v, 0.14).catch(orkGruntSynth)
}

/** Heavier ork roar (e.g. on a charge). */
export function playOrkRoar(dist = 0): void {
  const v = volForDist(dist, 0.6)
  if (v <= 0) return
  playSfx(ORK_ROAR, v, 0.1).catch(orkGruntSynth)
}

/** Bear roar on aggro — distance-scaled, synth fallback. */
export function playBearRoar(dist = 0): void {
  const v = volForDist(dist, 0.7)
  if (v <= 0) return
  playSfx(BEAR_ROAR, v, 0.08).catch(playRoar)
}

/** Bear growl on attack — distance-scaled, synth fallback. */
export function playBearGrowl(dist = 0): void {
  const v = volForDist(dist, 0.55)
  if (v <= 0) return
  playSfx(BEAR_GROWL, v, 0.12).catch(playRoar)
}

// Sampled dog/cat voices (CC0 — rubberduck barks + IgnasD/AntumDeluge meows,
// OpenGameArt). Random clip per call, distance-scaled, synth fallback.
const DOG_BARKS = ['/audio/dog-bark-1.ogg', '/audio/dog-bark-2.ogg']
const CAT_MEOWS = ['/audio/cat-meow-1.ogg', '/audio/cat-meow-2.ogg']

/** Dog bark — synth fallback (two short "ruff" bursts). */
function dogBarkSynth(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  const ruff = (t0: number) => {
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    const f = 280 + Math.random() * 90
    osc.frequency.setValueAtTime(f, t0)
    osc.frequency.exponentialRampToValueAtTime(f * 0.5, t0 + 0.12)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14)
    osc.connect(g).connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + 0.16)
    noise(c, t0, 0.08, 0.2, 'bandpass', 1200, 600)
  }
  ruff(t)
  if (Math.random() < 0.6) ruff(t + 0.16 + Math.random() * 0.08)
}

/** Dog bark — sampled clip, distance-scaled. */
export function playDogBark(dist = 0): void {
  const v = volForDist(dist, 0.3)
  if (v <= 0) return
  const f = DOG_BARKS[(Math.random() * DOG_BARKS.length) | 0]
  playSfx(f, v, 0.12).catch(dogBarkSynth)
}

/** Cat meow — sampled clip, distance-scaled. */
export function playCatMeow(dist = 0): void {
  const v = volForDist(dist, 0.22)
  if (v <= 0) return
  const f = CAT_MEOWS[(Math.random() * CAT_MEOWS.length) | 0]
  playSfx(f, v, 0.1).catch(() => {})
}

