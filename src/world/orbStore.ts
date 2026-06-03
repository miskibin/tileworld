import { addGold, addXp, getPlayer } from './playerStore'

// Reward orbs — the little gold/XP motes that burst off a slain creature, hang
// for a beat, then accelerate into the hero. The accelerating "suck" (not a
// constant glide) is what makes collection feel satisfying, and deferring the
// actual gold/XP grant to the moment an orb lands makes the HUD counter race up
// as they stream in. A hard life cap force-collects any straggler so a reward is
// never lost to a stuck orb. Magnet radius is a natural future upgrade.
//
// Pure per-frame channel like impactStore: combat calls spawnOrbs() on a kill,
// Orbs.tsx steps + renders the pool every frame. The grant calls (addGold/addXp)
// are the only notify path, firing once per orb on contact.

export type OrbKind = 'gold' | 'xp'

export interface Orb {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  kind: OrbKind
  value: number
  age: number
  /** age (sec) at which the orb switches from ballistic burst to homing seek */
  seekAt: number
}

const MAX = 160
const orbs: Orb[] = []

const MAX_SPEED = 30
const COLLECT_DIST = 0.85
const LIFE_CAP = 1.1 // force-collect past this age — keeps the suck short + snappy
const BURST_GRAVITY = -14
const BURST_DRAG = 3.0
const SEEK_RESPONSE = 16 // how hard velocity snaps onto the homing line (bigger = snappier)

function grant(o: Orb): void {
  if (o.kind === 'gold') addGold(o.value)
  else addXp(o.value)
}

/** Burst `count` orbs of `kind` at a point, splitting `totalValue` across them. */
export function spawnOrbs(kind: OrbKind, x: number, y: number, z: number, count: number, totalValue: number): void {
  if (totalValue <= 0 || count <= 0) return
  // Never spawn more orbs than there is value to split — otherwise the trailing
  // orbs would round up to 1 each and the burst would grant MORE than totalValue.
  count = Math.min(count, totalValue)
  const base = Math.floor(totalValue / count)
  let rem = totalValue - base * count
  for (let i = 0; i < count; i++) {
    // Saturating the pool grants + drops the oldest orb so its value isn't lost.
    if (orbs.length >= MAX) grant(orbs.shift()!)
    let val = base
    if (rem > 0) {
      val += 1
      rem--
    }
    const a = (i / count) * Math.PI * 2 + Math.random() * 1.3
    const sp = 1.4 + Math.random() * 1.3
    orbs.push({
      x,
      y: y + 0.2,
      z,
      vx: Math.cos(a) * sp,
      vy: 1.6 + Math.random() * 1.4,
      vz: Math.sin(a) * sp,
      kind,
      value: val,
      age: 0,
      seekAt: 0.1 + Math.random() * 0.1,
    })
  }
}

/** Advance every orb (burst → homing seek), collecting on contact / past life cap. */
export function stepOrbs(dt: number): void {
  if (dt <= 0) return // frozen during hit-stop — orbs hang mid-burst
  const p = getPlayer()
  const px = p.x
  const py = p.y + 1.0
  const pz = p.z
  // Accumulate this frame's collections and grant once at the end: a wave can
  // land dozens of orbs in a single frame, and granting per-orb would fire the
  // coin SFX + a HUD notify each time. One addGold/addXp per frame collapses
  // that to a single sound + notify while crediting the exact same total.
  let goldGain = 0
  let xpGain = 0
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i]
    o.age += dt
    if (o.age < o.seekAt) {
      // Burst: ballistic with drag + gravity and a soft floor bounce.
      const d = Math.max(0, 1 - BURST_DRAG * dt)
      o.vx *= d
      o.vz *= d
      o.vy = o.vy * d + BURST_GRAVITY * dt
      o.x += o.vx * dt
      o.y += o.vy * dt
      o.z += o.vz * dt
      if (o.y < 0.25) {
        o.y = 0.25
        o.vy *= -0.3
      }
    } else {
      // Seek: critically-damped homing — velocity snaps onto the line to the hero
      // at a speed that grows with distance, so it leaves fast and lands fast
      // instead of lazily re-accelerating from zero.
      const dx = px - o.x
      const dy = py - o.y
      const dz = pz - o.z
      const dist = Math.hypot(dx, dy, dz) || 1
      const targetSpeed = Math.min(MAX_SPEED, 7 + dist * 16)
      const k = Math.min(1, SEEK_RESPONSE * dt)
      o.vx += ((dx / dist) * targetSpeed - o.vx) * k
      o.vy += ((dy / dist) * targetSpeed - o.vy) * k
      o.vz += ((dz / dist) * targetSpeed - o.vz) * k
      o.x += o.vx * dt
      o.y += o.vy * dt
      o.z += o.vz * dt
      if (dist < COLLECT_DIST) {
        if (o.kind === 'gold') goldGain += o.value
        else xpGain += o.value
        orbs.splice(i, 1)
        continue
      }
    }
    if (o.age > LIFE_CAP) {
      if (o.kind === 'gold') goldGain += o.value
      else xpGain += o.value
      orbs.splice(i, 1)
    }
  }
  if (goldGain > 0) addGold(goldGain)
  if (xpGain > 0) addXp(xpGain)
}

export function getOrbs(): Orb[] {
  return orbs
}

export function resetOrbs(): void {
  orbs.length = 0
}
