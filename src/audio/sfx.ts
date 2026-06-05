import { getListener, isEnabled, playSfx, playVoice, isVoicePlaying, audioMix } from './audio'

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

// Single master gain for ALL procedural SFX — one knob to keep combat from
// drowning the mix. Cached per AudioContext, sits between every tone/noise and
// the speakers. Level is re-read from the live mix on each fetch so the leva
// panel can tune it in real time.
const masterCache = new WeakMap<AudioContext, GainNode>()
function master(c: AudioContext): GainNode {
  let g = masterCache.get(c)
  if (!g) {
    g = c.createGain()
    g.connect(c.destination)
    masterCache.set(c, g)
  }
  g.gain.value = audioMix.sfx
  return g
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
  osc.connect(g).connect(master(c))
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
  src.connect(filter).connect(g).connect(master(c))
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

/** ±frac random pitch multiplier — keeps repeated synth SFX from sounding
 *  identical every time (sampled SFX get this via playSfx's pitchJitter). */
function vary(frac = 0.06): number {
  return 1 + (Math.random() * 2 - 1) * frac
}

// var-2 is the meaty blade-on-flesh impact (used for orks/creatures); var-1 and
// var-3 are metallic clangs — used both for chipping stone (ore mining) and for a
// blow ringing off the hero's steel armor (playPlayerHit).
const FLESH_HIT_CLIP = '/audio/sword-hit-var-2.wav'
const METALLIC_HIT_CLIPS = [
  '/audio/sword-hit-var-1.wav',
  '/audio/sword-hit-var-3.wav',
] as const

/** Sword whoosh — sampled blade swipe, synth fallback. `vol` (0..1) scales it
 *  down for distant fights (villagers); the hero's own swing uses the default 1. */
export function playSwing(vol = 1): void {
  if (vol <= 0.02) return
  playSfx('/audio/sword-swing.mp3', 0.3 * vol, 0.12).catch(() => swingSynth(vol))
}

/** Synth fallback for playSwing — descending band-passed noise sweep. */
function swingSynth(vol = 1): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  noise(c, t, 0.2, 0.12 * vol, 'bandpass', 2600, 700)
}

/** Blade-on-flesh impact — sampled hit (clang + crunch), synth fallback. `vol`
 *  (0..1) scales it for distance — the hero's own hit uses the default 1. */
export function playHit(vol = 1): void {
  if (vol <= 0.02) return
  playSfx(FLESH_HIT_CLIP, 0.5 * vol, 0.08).catch(() => hitSynth(vol))
}

/** Metallic chip — blade/pick on stone, for mining ore boulders. Reuses the two
 *  metallic sword-hit takes; synth fallback shares the flesh-hit crack. */
export function playPick(vol = 1): void {
  if (vol <= 0.02) return
  const clip = METALLIC_HIT_CLIPS[(Math.random() * METALLIC_HIT_CLIPS.length) | 0]
  playSfx(clip, 0.5 * vol, 0.1).catch(() => hitSynth(vol))
}

/** Hit landing on the HERO — metallic sword-on-armor clang, the same impact the
 *  player hears swinging into a foe, so taking a blow reads as a real strike.
 *  Layered over playHurt's dull thud; synth fallback shares the flesh-hit crack. */
export function playPlayerHit(): void {
  const clip = METALLIC_HIT_CLIPS[(Math.random() * METALLIC_HIT_CLIPS.length) | 0]
  playSfx(clip, 0.5, 0.1).catch(() => hitSynth())
}

/** Synth fallback for playHit — noise crack + low thud. */
function hitSynth(vol = 1): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  noise(c, t, 0.09, 0.18 * vol, 'highpass', 1800, 600)
  tone(c, 'triangle', 180, t, 0.12, 0.14 * vol, 70)
}

/** Heavier impact on a kill. */
export function playKill(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  const p = vary(0.07)
  noise(c, t, 0.16, 0.22, 'lowpass', 1400 * p, 250 * p)
  tone(c, 'square', 130 * p, t, 0.2, 0.16, 48 * p)
}

/** Player gets hurt — dull low thud. */
export function playHurt(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  const p = vary(0.08)
  tone(c, 'square', 150 * p, t, 0.18, 0.16, 60 * p)
  noise(c, t, 0.1, 0.08, 'lowpass', 800 * p, 200 * p)
}

/** Coin pickup — two bright ascending blips. */
export function playGold(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  const p = vary(0.08)
  tone(c, 'square', 880 * p, t, 0.08, 0.08)
  tone(c, 'square', 1320 * p, t + 0.06, 0.1, 0.08)
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

/** Villager "hmm" — randomly the old synth murmur or the sampled grunt, so the
 *  town speaks in two voices instead of one. Both kept quiet. */
export function playVillagerGrunt(): void {
  if (Math.random() < 0.5) {
    villagerGruntSynth()
  } else {
    playSfx('/audio/villager-grunt.mp3', 0.16, 0.2).catch(villagerGruntSynth)
  }
}

/** Synth fallback for playVillagerGrunt — nasal vowel grunt. */
function villagerGruntSynth(): void {
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
  g.gain.exponentialRampToValueAtTime(0.1, t + 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36)
  osc.connect(formant).connect(g).connect(master(c))
  osc.start(t)
  osc.stop(t + 0.4)
}

/** Chest opening — sampled metallic latch, synth fallback. */
export function playChestOpen(): void {
  playSfx('/audio/chest-open.mp3', 0.45, 0.05).catch(chestOpenSynth)
}

/** Synth fallback for playChestOpen — wooden creak + a soft treasure chime. */
function chestOpenSynth(): void {
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

/** Shield block — sampled wood knock, synth fallback. */
export function playBlock(): void {
  playSfx('/audio/block.mp3', 0.45, 0.1).catch(blockSynth)
}

/** Synth fallback for playBlock — bright metallic clang (parry feedback). */
function blockSynth(): void {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  tone(c, 'square', 880, t, 0.1, 0.12, 520)
  tone(c, 'triangle', 1760, t, 0.07, 0.07)
  noise(c, t, 0.07, 0.12, 'highpass', 5200, 2600)
}

// Creature voices have NO synth fallback — if the sample is missing/fails to
// load, the call goes silent (procedural creature noise sounded terrible).

// ─── Sampled creature voices (CC0 clips in public/audio) ─────────────────────
// rubberduck — "80 CC0 creature SFX" (OpenGameArt, CC0 / public domain).
// Each play is volume-scaled by distance to the player and falls back to a
// synth grunt/roar if the clip fails to load.
const ORK_GRUNTS = [
  '/audio/ork-grunt-1.ogg',
  '/audio/ork-grunt-2.ogg',
  '/audio/ork-grunt-3.ogg',
  '/audio/monster-snarl.ogg',
  '/audio/monster-growl.ogg',
]
const ORK_ROARS = ['/audio/ork-roar.ogg', '/audio/monster-roar-big.ogg']
const BEAR_ROAR = '/audio/bear-roar.mp3'
const BEAR_GROWL = '/audio/bear-growl.ogg'

function volForDist(dist: number, base: number): number {
  const range = audioMix.range // tiles; beyond this a creature voice is silent
  if (dist >= range) return 0
  return base * (1 - dist / range)
}

/** Ork grunt on aggro/attack — random clip, distance-scaled. */
export function playOrkGrunt(dist = 0): void {
  const v = volForDist(dist, 0.55)
  if (v <= 0) return
  const f = ORK_GRUNTS[(Math.random() * ORK_GRUNTS.length) | 0]
  playSfx(f, v, 0.14).catch(() => {})
}

/** Heavier ork roar (e.g. on a charge) — random clip, distance-scaled. */
export function playOrkRoar(dist = 0): void {
  const v = volForDist(dist, 0.6)
  if (v <= 0) return
  const f = ORK_ROARS[(Math.random() * ORK_ROARS.length) | 0]
  playSfx(f, v, 0.1).catch(() => {})
}

/** Bear roar on aggro — distance-scaled, synth fallback. */
export function playBearRoar(dist = 0): void {
  const v = volForDist(dist, 0.7)
  if (v <= 0) return
  playSfx(BEAR_ROAR, v, 0.08).catch(() => {})
}

/** Bear growl on attack — distance-scaled, synth fallback. */
export function playBearGrowl(dist = 0): void {
  const v = volForDist(dist, 0.55)
  if (v <= 0) return
  playSfx(BEAR_GROWL, v, 0.12).catch(() => {})
}

// Sampled dog/cat voices (CC0 — rubberduck barks + IgnasD/AntumDeluge meows,
// OpenGameArt). Random clip per call, distance-scaled, synth fallback.
const DOG_BARKS = [
  '/audio/dog-bark-1.ogg',
  '/audio/dog-bark-2.ogg',
  '/audio/dog-bark-3.mp3',
  '/audio/dog-bark-4.mp3',
]
const CAT_MEOWS = [
  '/audio/cat-meow-1.ogg',
  '/audio/cat-meow-2.ogg',
  '/audio/cat-meow-3.mp3',
  '/audio/cat-meow-4.mp3',
]

/** Dog bark — sampled clip, distance-scaled. */
export function playDogBark(dist = 0): void {
  const v = volForDist(dist, 0.16)
  if (v <= 0) return
  const f = DOG_BARKS[(Math.random() * DOG_BARKS.length) | 0]
  playSfx(f, v, 0.12).catch(() => {})
}

/** Cat meow — sampled clip, distance-scaled. */
export function playCatMeow(dist = 0): void {
  const v = volForDist(dist, 0.12)
  if (v <= 0) return
  const f = CAT_MEOWS[(Math.random() * CAT_MEOWS.length) | 0]
  playSfx(f, v, 0.1).catch(() => {})
}

// ─── Sampled hero voice + UI/event stings ────────────────────────────────────
// CC0 unless noted: rubberduck creature/RPG packs (player grunts, coin) and
// Listener (OpenGameArt). Level-up fanfare is CC-BY 3.0 (Bart Kelsey) — see
// docs/audio-candidates.md. All non-spatial, kept quiet so they sit under combat.

// Sully (ElevenLabs) hero grunt pools — a random take per event so repeated
// swings/hits don't reuse the same grunt. Low pitch jitter keeps the voice intact.
const HERO_SWINGS = ['/audio/player-swing-1.mp3', '/audio/player-swing-2.mp3']
const HERO_HURTS = ['/audio/player-hurt-1.mp3', '/audio/player-hurt-2.mp3', '/audio/player-hurt-3.mp3']
const HERO_DEATHS = ['/audio/player-death-1.mp3', '/audio/player-death-2.mp3']
const pick = <T,>(a: readonly T[]): T => a[(Math.random() * a.length) | 0]

// One mouth at a time: a grunt never fires while the hero is speaking a line,
// and grunts are rate-limited so combat doesn't spam them.
let lastGruntAt = 0
const GRUNT_MIN_GAP = 1.6 // seconds between any mouth grunts
function canGrunt(): boolean {
  if (isVoicePlaying()) return false
  const now = (typeof performance !== 'undefined' ? performance.now() : 0) * 0.001
  if (now - lastGruntAt < GRUNT_MIN_GAP) return false
  lastGruntAt = now
  return true
}

/** Hero exertion grunt on a melee swing — gated by canGrunt so it punctuates
 *  rather than nags. Layered over the procedural whoosh (playSwing). */
export function playPlayerAttack(): void {
  if (Math.random() > 0.34) return
  if (!canGrunt()) return
  playSfx(pick(HERO_SWINGS), 0.4, 0.05).catch(() => {})
}

/** Hero pain cry on a (non-fatal) hit — random grunt over playHurt's thud. */
export function playPlayerHurtVoice(): void {
  if (!canGrunt()) return
  playSfx(pick(HERO_HURTS), 0.45, 0.05).catch(() => {})
}

/** Hero effort grunt on a jump — quiet, occasional (caller gates the rate). */
export function playPlayerJump(): void {
  if (!canGrunt()) return
  playSfx('/audio/player-jump-1.mp3', 0.28, 0.06).catch(() => {})
}

/** Hero death scream — fires once on the killing blow. Routed through the
 *  narration node so it interrupts any in-progress biome line and stands alone. */
export function playPlayerDeath(): void {
  void playVoice(pick(HERO_DEATHS), 1)
}

/** Coin pickup — sampled jingle, falls back to the procedural blips. */
export function playGoldPickup(): void {
  // Synth two-blip jingle — preferred over the sampled clip.
  playGold()
}

/** Level-up flourish — orchestral sting, falls back to the procedural arpeggio. */
export function playLevelUpFanfare(): void {
  playSfx('/audio/level-up-orchestra.wav', 0.38, 0.04).catch(playLevelUp)
}

/** Using a hotbar item — soft magical whoosh. */
export function playAbilityCast(): void {
  playSfx('/audio/ability-cast.ogg', 0.3, 0.08).catch(() => {})
}

/** Shop panel opens — latch click. */
export function playShopOpen(): void {
  playSfx('/audio/shop-open.ogg', 0.35, 0.05).catch(() => {})
}

/** Confirm a menu/upgrade purchase — short UI blip. */
export function playMenuClick(): void {
  playSfx('/audio/menu-select.ogg', 0.22, 0.06).catch(() => {})
}

/** A wave begins — distant horde call. */
export function playWaveStart(): void {
  playSfx('/audio/wave-start-roar.ogg', 0.5, 0.08).catch(() => {})
}

