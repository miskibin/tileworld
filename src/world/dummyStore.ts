import { tileAt, tileTopY } from './tileMap'

// Training dummies — static, indestructible practice targets standing in the
// muster yards by the castle gates. The player hits them with the normal sword
// swing (the SAME Character swing-cone scan as ore/creatures); a hit just flashes
// + wobbles the dummy and floats the damage number. There is NO HP and NO reward
// — that's the whole point: practice feel only, so there's nothing to farm. The
// one `isPell` dummy per yard is a quintain: a live view swings its arm on a
// timer so the player can drill the right-click block (harmless either way).
//
// No AI/movement here beyond what the pell view animates; placement lives in
// MusterYard.tsx. This is oreStore minus the HP/reward, plus an isPell flag.

export interface DummyState {
  id: number
  x: number
  y: number
  z: number
  seed: number
  /** r3f-clock time the straw-flash decays at (set on a hit). */
  hurtFlashUntil: number
  /** r3f-clock time the recoil-wobble decays at (set on a hit). */
  wobbleUntil: number
  collisionRadius: number
  /** the one quintain per yard that swings an arm to drill blocking */
  isPell: boolean
}

const dummies: DummyState[] = []
let nextId = 0

export function createDummy(x: number, z: number, seed: number, isPell = false): DummyState {
  const fx = Math.floor(x)
  const fz = Math.floor(z)
  const t = tileAt(fx, fz)
  const y = t ? tileTopY(fx, fz) : 1
  const d: DummyState = {
    id: nextId++,
    x,
    y,
    z,
    seed,
    hurtFlashUntil: 0,
    wobbleUntil: 0,
    collisionRadius: 0.28,
    isPell,
  }
  dummies.push(d)
  return d
}

export function resetDummies(): void {
  dummies.length = 0
  nextId = 0
}

export function getDummies(): DummyState[] {
  return dummies
}

/** Dummies never die, so "alive" is every dummy — named to match the other
 *  hittable stores so the Character swing scan reads uniformly across them. */
export function getAliveDummies(): DummyState[] {
  return dummies
}

/** Register a hit: brief straw-flash + recoil wobble. No HP, no reward. */
export function damageDummy(d: DummyState, now: number): void {
  d.hurtFlashUntil = now + 0.18
  d.wobbleUntil = now + 0.5
}

/** Player-vs-dummy blocking check (used in movement collision so you bump a
 *  dummy and stand to swing instead of walking through it). Mirrors oreCollidesAt. */
export function dummyCollidesAt(x: number, z: number, r: number): boolean {
  for (let i = 0; i < dummies.length; i++) {
    const d = dummies[i]
    const dx = x - d.x
    const dz = z - d.z
    const rsum = r + d.collisionRadius
    if (dx * dx + dz * dz < rsum * rsum) return true
  }
  return false
}
