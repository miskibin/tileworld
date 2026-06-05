// Tracks whether the player is in a real, sustained fight with ORKS (incl. camp
// guards) — the trigger for the day combat-music swell in SoundScape. Bears,
// hunting prey, and villager-vs-ork brawls don't count.
//
// Debounced so a single stray blow (one swing clipping an ork, an arrow that
// happens to land) doesn't kick the music on: a fight is only "confirmed" after
// ENGAGE_HITS blows land within ENGAGE_WINDOW, and it ends after DISENGAGE_AFTER
// seconds with no blow. Pure + tiny (no audio import) so it's safe to call from
// store mutators and unit tests.

const ENGAGE_HITS = 3 // blows needed to confirm a real fight…
const ENGAGE_WINDOW = 3 // …within this many seconds
const DISENGAGE_AFTER = 4 // seconds with no blow → the fight is over

let lastBlowAt = -Infinity
let streakStartAt = -Infinity
let blowCount = 0
let engaged = false

function nowSec(): number {
  return (typeof performance !== 'undefined' ? performance.now() : 0) * 0.001
}

/** Stamp "the player just traded a blow with an ork" — hero hits an ork or an
 *  ork (melee or shaman bolt) hits the hero. Confirms a fight after a few blows. */
export function markCombat(): void {
  const t = nowSec()
  // Start a fresh sliding window when either: a long quiet gap broke the run, OR
  // an as-yet-unconfirmed streak's window has lapsed. Without the second clause
  // streakStartAt stayed anchored to the first-ever blow, so a real ENGAGE_HITS-
  // in-ENGAGE_WINDOW burst that opened with a slower exchange could never confirm.
  if (t - lastBlowAt > DISENGAGE_AFTER || (!engaged && t - streakStartAt > ENGAGE_WINDOW)) {
    blowCount = 0
    streakStartAt = t
  }
  lastBlowAt = t
  blowCount += 1
  if (!engaged && blowCount >= ENGAGE_HITS && t - streakStartAt <= ENGAGE_WINDOW) {
    engaged = true
  }
}

/** True while a confirmed ork fight is ongoing. Lazily disengages once the blows
 *  stop for DISENGAGE_AFTER seconds (called every frame from SoundScape). */
export function combatActive(): boolean {
  if (!engaged) return false
  if (nowSec() - lastBlowAt > DISENGAGE_AFTER) {
    engaged = false
    blowCount = 0
    return false
  }
  return true
}

export function resetCombat(): void {
  lastBlowAt = -Infinity
  streakStartAt = -Infinity
  blowCount = 0
  engaged = false
}
