# Biome Creatures, Loot & Buffs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six biome-signature creatures that drop themed hotbar items, with consumables that can grant short timed buffs (resist / power / haste).

**Architecture:** New creatures are new `AnimalSpecies` reusing the existing `animalAI.ts` behavior branches (predator / prey / boar) — config + a hand-built `*View` model per creature, no AI-logic changes. Loot is new `ITEM_DEFS` delivered as pooled ground pickups on kill (template: `impactStore`/`Impacts`) plus biome chests. Buffs are a small `buffStore` whose three multiplier getters are read by the existing damage/attack/move hot paths.

**Tech Stack:** React 19 + @react-three/fiber + three.js + TypeScript + Vite. Tests: vitest (`npm run test`). Model verification: `npm run inspect <Name>` (headless). Build gate: `npm run build` (`tsc -b`).

Spec: [docs/superpowers/specs/2026-06-01-biome-creatures-loot-design.md](../specs/2026-06-01-biome-creatures-loot-design.md).

---

## File Structure

**New files:**
- `src/world/buffStore.ts` — three timed buffs; multiplier getters (single source of truth).
- `src/world/buffStore.test.ts` — unit test for buff math + expiry.
- `src/world/pickupStore.ts` — pooled ground-loot tokens (no notify), like `impactStore`.
- `src/world/Pickups.tsx` — renders/steps the pickup pool, auto-collects near the player.
- `src/world/PolarBear.tsx`, `Scorpion.tsx`, `BogCroc.tsx`, `Elk.tsx`, `Goat.tsx`, `Golem.tsx` — creature views.
- `src/hud/BuffBar.tsx` — buff pips, visible only while a buff is active.

**Modified files:**
- `src/world/animalConfig.ts` — 6 new species + `dropItemId`/`dropChance` fields.
- `src/world/inventoryStore.ts` — `buff` field on `ItemDef`; 6 new defs; apply buff on consume.
- `src/world/playerStore.ts` — resist hook in `damagePlayer`.
- `src/world/Character.tsx` — power hook (swing dmg), haste hook (move speed), drop roll on kill.
- `src/world/WildAnimals.tsx` — 6 new spawns + view switch entries.
- `src/world/World.tsx` — mount `<Pickups/>`; 6 biome chests.
- `src/hud/Hud.tsx` — mount `<BuffBar/>`.
- `src/hud/hud.css` — buff-bar styles.
- `scripts/inspect-model.tsx` — register the 6 creatures.

---

## Task 1: buffStore (TDD)

**Files:**
- Create: `src/world/buffStore.ts`
- Test: `src/world/buffStore.test.ts`

- [ ] **Step 1: Write the failing test**

`src/world/buffStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyBuff,
  resetBuffs,
  getDamageTakenMult,
  getDamageDealtMult,
  getSpeedMult,
  getActiveBuffs,
} from './buffStore'

// buffStore reads the clock via performance.now(); vitest's jsdom provides it.
beforeEach(() => resetBuffs())

describe('buffStore', () => {
  it('multipliers are neutral with no buffs', () => {
    expect(getDamageTakenMult()).toBe(1)
    expect(getDamageDealtMult()).toBe(1)
    expect(getSpeedMult()).toBe(1)
    expect(getActiveBuffs(performance.now() * 0.001)).toEqual([])
  })

  it('resist lowers damage taken while active', () => {
    applyBuff('resist', 1000, 0.6)
    expect(getDamageTakenMult()).toBe(0.6)
    expect(getDamageDealtMult()).toBe(1) // unrelated buffs stay neutral
  })

  it('power raises damage dealt; haste raises speed', () => {
    applyBuff('power', 1000, 1.4)
    applyBuff('haste', 1000, 1.3)
    expect(getDamageDealtMult()).toBe(1.4)
    expect(getSpeedMult()).toBe(1.3)
  })

  it('a buff expires after its duration', () => {
    // duration 0 → already expired on the next read.
    applyBuff('resist', 0, 0.6)
    expect(getDamageTakenMult()).toBe(1)
  })

  it('re-applying refreshes the multiplier and keeps it active', () => {
    applyBuff('power', 0, 1.4) // expired
    applyBuff('power', 1000, 1.5) // fresh, new mag
    expect(getDamageDealtMult()).toBe(1.5)
  })

  it('getActiveBuffs lists active buffs with remaining seconds', () => {
    applyBuff('haste', 2000, 1.3)
    const now = performance.now() * 0.001
    const active = getActiveBuffs(now)
    expect(active.map((b) => b.kind)).toEqual(['haste'])
    expect(active[0].remain).toBeGreaterThan(0)
    expect(active[0].remain).toBeLessThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- buffStore`
Expected: FAIL — `Cannot find module './buffStore'`.

- [ ] **Step 3: Write minimal implementation**

`src/world/buffStore.ts`:
```ts
// Three short timed buffs, granted by consumables. This module is the SINGLE
// source of truth for the gameplay multipliers — the damage/attack/move hot
// paths read the getters below rather than tracking buffs themselves. Expiry is
// lazy (compared against the clock on read); the HUD ticks once a second to
// drive the visible countdown and fire notify on expiry.

export type BuffKind = 'resist' | 'power' | 'haste'

interface BuffState {
  /** wall-clock (sec) the buff expires; 0 = inactive */
  until: number
  /** multiplier magnitude for this buff (e.g. resist 0.6, power 1.4) */
  mag: number
}

const buffs: Record<BuffKind, BuffState> = {
  resist: { until: 0, mag: 1 },
  power: { until: 0, mag: 1 },
  haste: { until: 0, mag: 1 },
}

const subs = new Set<() => void>()
function notify(): void {
  subs.forEach((fn) => fn())
}

function now(): number {
  return performance.now() * 0.001
}

function isActive(k: BuffKind): boolean {
  return buffs[k].until > now()
}

/** Grant (or refresh) a buff for `durationMs` with multiplier `mag`. */
export function applyBuff(kind: BuffKind, durationMs: number, mag: number): void {
  buffs[kind].until = now() + durationMs / 1000
  buffs[kind].mag = mag
  notify()
}

/** Incoming-damage multiplier (resist → <1, else 1). */
export function getDamageTakenMult(): number {
  return isActive('resist') ? buffs.resist.mag : 1
}

/** Outgoing-damage multiplier (power → >1, else 1). */
export function getDamageDealtMult(): number {
  return isActive('power') ? buffs.power.mag : 1
}

/** Move-speed multiplier (haste → >1, else 1). */
export function getSpeedMult(): number {
  return isActive('haste') ? buffs.haste.mag : 1
}

export interface ActiveBuff {
  kind: BuffKind
  /** seconds remaining */
  remain: number
}

/** Active buffs with remaining seconds, for the HUD. Pass the current time. */
export function getActiveBuffs(nowSec: number): ActiveBuff[] {
  const out: ActiveBuff[] = []
  for (const k of Object.keys(buffs) as BuffKind[]) {
    const remain = buffs[k].until - nowSec
    if (remain > 0) out.push({ kind: k, remain })
  }
  return out
}

export function subscribeBuffs(fn: () => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

export function resetBuffs(): void {
  for (const k of Object.keys(buffs) as BuffKind[]) {
    buffs[k].until = 0
    buffs[k].mag = 1
  }
  notify()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- buffStore`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/buffStore.ts src/world/buffStore.test.ts
git commit -m "feat: buffStore — timed resist/power/haste multipliers"
```

---

## Task 2: Loot items + apply-buff-on-consume

Adds the `buff` field to `ItemDef`, the 6 new item defs, and makes consuming a
buff item call `applyBuff`. `BuffKind` is imported from Task 1.

**Files:**
- Modify: `src/world/inventoryStore.ts`

- [ ] **Step 1: Add the import + `buff` field to `ItemDef`**

At the top of `src/world/inventoryStore.ts`, add to the existing imports:
```ts
import { applyBuff, type BuffKind } from './buffStore'
```

In the `ItemDef` interface (currently ends after `stackable: boolean`), add before the closing brace:
```ts
  /** consumable: timed buff granted on use (in addition to any heal) */
  buff?: { kind: BuffKind; durationMs: number; mag: number }
```

- [ ] **Step 2: Add the 6 loot item defs**

In `ITEM_DEFS` (after the existing `axe` entry, before the closing brace):
```ts
  // ─── Biome creature drops (Phase 2) ───────────────────────────
  fur: {
    id: 'fur', name: 'Thick Fur', icon: '🧥', kind: 'consumable', stackable: true,
    buff: { kind: 'resist', durationMs: 12000, mag: 0.6 },
  },
  venom: {
    id: 'venom', name: 'Venom Vial', icon: '🧫', kind: 'consumable', stackable: true,
    buff: { kind: 'power', durationMs: 12000, mag: 1.4 },
  },
  goat_charm: {
    id: 'goat_charm', name: 'Goat Charm', icon: '🔔', kind: 'consumable', stackable: true,
    buff: { kind: 'haste', durationMs: 12000, mag: 1.3 },
  },
  croc_steak: { id: 'croc_steak', name: 'Croc Steak', icon: '🥩', kind: 'consumable', heal: 70, stackable: true },
  elk_jerky: { id: 'elk_jerky', name: 'Elk Jerky', icon: '🍖', kind: 'consumable', heal: 35, stackable: true },
  stone_maul: { id: 'stone_maul', name: 'Stone Maul', icon: '🔨', kind: 'weapon', damageBonus: 26, stackable: false },
```

- [ ] **Step 3: Apply the buff in `activateSlot`'s consumable branch**

In `activateSlot`, find the `if (def.kind === 'consumable') {` block. Right after the
existing `healPlayer(def.heal ?? 0)` line, add:
```ts
    if (def.buff) applyBuff(def.buff.kind, def.buff.durationMs, def.buff.mag)
```
(The `heal ?? 0` already no-ops for pure-buff items that have no `heal`.)

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: PASS (exit 0). If `BuffKind` import errors, confirm Task 1 committed.

- [ ] **Step 5: Commit**

```bash
git add src/world/inventoryStore.ts
git commit -m "feat: biome loot items + apply buff on consume"
```

---

## Task 3: Wire buff multipliers into the hot paths

Three one-line hooks, each reading a Task-1 getter. No new logic.

**Files:**
- Modify: `src/world/playerStore.ts` (resist)
- Modify: `src/world/Character.tsx` (power + haste)

- [ ] **Step 1: Resist hook in `damagePlayer`**

In `src/world/playerStore.ts`, add to the imports near the top:
```ts
import { getDamageTakenMult } from './buffStore'
```
In `damagePlayer`, the function starts with `let dmg = amount`. Change it to:
```ts
  let dmg = amount * getDamageTakenMult()
```
(The shield-block reduction below still multiplies `dmg` further — order is fine: resist then block.)

- [ ] **Step 2: Power + haste hooks in `Character.tsx`**

In `src/world/Character.tsx`, add to the imports near the top (next to the other `./` imports):
```ts
import { getDamageDealtMult, getSpeedMult } from './buffStore'
```

Haste — find the movement step line inside `useFrame`:
```ts
      const step = SPEED * (sprinting ? SPRINT_MULT : 1) * dt
```
Change to:
```ts
      const step = SPEED * (sprinting ? SPRINT_MULT : 1) * getSpeedMult() * dt
```

Power — find the swing damage line (inside the attack hit-resolution):
```ts
          const dmg = getAttackDamage() + getWeaponBonus()
```
Change to:
```ts
          const dmg = Math.round((getAttackDamage() + getWeaponBonus()) * getDamageDealtMult())
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: PASS (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/world/playerStore.ts src/world/Character.tsx
git commit -m "feat: apply resist/power/haste buffs to damage + movement"
```

---

## Task 4: pickupStore + Pickups component

Pooled ground-loot tokens. Module pool + per-frame step/collect, no notify —
modeled on `impactStore`/`Impacts.tsx`. Collect = walk within range → `addItem`.

**Files:**
- Create: `src/world/pickupStore.ts`
- Create: `src/world/Pickups.tsx`
- Modify: `src/world/World.tsx`

- [ ] **Step 1: Write `pickupStore.ts`**

`src/world/pickupStore.ts`:
```ts
// Pooled ground loot — a small floating token the player walks over to collect.
// Pure per-frame channel like impactStore: kill code calls spawnPickup(), and
// Pickups.tsx steps + collects every frame. No notify (only the 3D scene reads
// it). A token that can't be collected (hotbar full) stays on the ground.

export interface Pickup {
  id: number
  itemId: string
  x: number
  y: number
  z: number
  born: number // sec, for the bob/spin phase
}

const pickups: Pickup[] = []
let nextId = 0
const MAX = 64

/** Drop a loot token at a world-grid point. */
export function spawnPickup(itemId: string, x: number, y: number, z: number): void {
  if (pickups.length >= MAX) pickups.shift()
  pickups.push({ id: nextId++, itemId, x, y, z, born: performance.now() * 0.001 })
}

export function getPickups(): Pickup[] {
  return pickups
}

/** Remove a collected token by id. */
export function removePickup(id: number): void {
  const i = pickups.findIndex((p) => p.id === id)
  if (i !== -1) pickups.splice(i, 1)
}

export function resetPickups(): void {
  pickups.length = 0
  nextId = 0
}
```

- [ ] **Step 2: Write `Pickups.tsx`**

`src/world/Pickups.tsx`:
```ts
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPickups, removePickup, resetPickups } from './pickupStore'
import { isFrozen } from './pauseStore'
import { getPlayer } from './playerStore'
import { addItem, ITEM_DEFS } from './inventoryStore'
import { spawnFloat } from './fxStore'
import { playGoldPickup } from '../audio/sfx'

// Renders + drives the ground-loot pool. Tokens live in grid coords, so this
// must mount inside World's offset group. Each token is a small spinning/bobbing
// box tinted per item; walking within COLLECT_DIST adds it to the hotbar. If the
// bag is full, addItem returns false and the token stays put (no silent loss).

const COLLECT_DIST = 0.9
const BOX = new THREE.BoxGeometry(0.22, 0.22, 0.22)

// Per-item tint so drops read apart at a glance (no <Text>, so it inspects clean
// and survives capture mode).
const TINT: Record<string, string> = {
  fur: '#d8c8a0',
  venom: '#7ad24a',
  goat_charm: '#e0b04a',
  croc_steak: '#b05a4a',
  elk_jerky: '#8a5a34',
  stone_maul: '#9aa0a8',
}

export function Pickups() {
  const groupRef = useRef<THREE.Group>(null!)
  const mats = useMemo(() => {
    const m: Record<string, THREE.MeshStandardMaterial> = {}
    for (const id of Object.keys(TINT)) {
      m[id] = new THREE.MeshStandardMaterial({ color: TINT[id], roughness: 0.5, metalness: 0.2, emissive: TINT[id], emissiveIntensity: 0.25, toneMapped: false })
    }
    return m
  }, [])

  useEffect(() => () => resetPickups(), [])

  useFrame(({ clock }) => {
    if (isFrozen()) return
    const grp = groupRef.current
    if (!grp) return
    const tNow = clock.getElapsedTime()
    const list = getPickups()
    const p = getPlayer()

    // Reconcile children to the pool (cheap — pool is tiny, max 64).
    while (grp.children.length > list.length) grp.remove(grp.children[grp.children.length - 1])
    while (grp.children.length < list.length) {
      const mesh = new THREE.Mesh(BOX, mats.fur)
      mesh.castShadow = true
      grp.add(mesh)
    }

    for (let i = list.length - 1; i >= 0; i--) {
      const pk = list[i]
      const mesh = grp.children[i] as THREE.Mesh
      mesh.material = mats[pk.itemId] ?? mats.fur
      const phase = tNow - pk.born
      mesh.position.set(pk.x, pk.y + 0.45 + Math.sin(phase * 2.5) * 0.08, pk.z)
      mesh.rotation.y = phase * 1.6
      // Collect when the player is close enough.
      if (Math.hypot(p.x - pk.x, p.z - pk.z) < COLLECT_DIST) {
        if (addItem(pk.itemId)) {
          const def = ITEM_DEFS[pk.itemId]
          spawnFloat(`+${def?.name ?? 'Item'}`, '#9be88a', pk.x, pk.y + 1.4, pk.z)
          playGoldPickup()
          removePickup(pk.id)
        }
        // else: bag full → leave it on the ground.
      }
    }
  })

  return <group ref={groupRef} />
}
```

- [ ] **Step 3: Mount `<Pickups/>` in World**

In `src/world/World.tsx`, add to the imports (next to `import { Impacts } from './Impacts'`):
```ts
import { Pickups } from './Pickups'
```
Inside the offset group, right after the `<Impacts />` line, add:
```tsx
        {/* Ground loot dropped by slain creatures (grid-space, pooled like Impacts) */}
        <Pickups />
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: PASS (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/world/pickupStore.ts src/world/Pickups.tsx src/world/World.tsx
git commit -m "feat: pooled ground-loot pickups, auto-collected near player"
```

---

## Task 5: Creature config + kill-drop roll

Adds the 6 species stat blocks and the `dropItemId`/`dropChance` fields, then makes a
kill spawn the drop. The `AnimalSpecies` union lives in `animalConfig.ts` and is
imported by `animalStore.ts`, so this one file widens the species set.

**Files:**
- Modify: `src/world/animalConfig.ts`
- Modify: `src/world/Character.tsx`

- [ ] **Step 1: Widen the species union + config interface**

In `src/world/animalConfig.ts`, change the `AnimalSpecies` type to:
```ts
export type AnimalSpecies =
  | 'wolf' | 'deer' | 'boar' | 'rabbit'
  | 'polar_bear' | 'scorpion' | 'bog_croc' | 'elk' | 'goat' | 'golem'
```
Add to the `AnimalConfig` interface (before its closing brace):
```ts
  /** item id dropped on death (from ITEM_DEFS); omit for no drop */
  dropItemId?: string
  /** 0..1 chance to drop (default 1 when dropItemId is set) */
  dropChance?: number
```

- [ ] **Step 2: Add the 6 stat blocks**

In `ANIMAL_CONFIG` (after the existing `boar` entry, before the closing brace).
Behavior reuses the three existing branches; `faction` must match `behavior`
('predator' | 'prey' | 'boar') per `animalAI.ts`:
```ts
  // ─── Biome signature creatures (Phase 2) ──────────────────────
  // Snow: hulking predator — slow, heavy hits.
  polar_bear: {
    faction: 'predator', behavior: 'predator', hp: 200, speed: 3.0, wanderSpeed: 0.9,
    aggro: 13, leash: 20, fear: 0, melee: 1.6, attackDamage: 24, attackDuration: 0.6,
    attackCooldown: 1.4, turnRate: 6, pathRecompute: 0.45, waypointRadius: 0.5,
    scale: 0.62, collisionRadius: 0.42, blocks: true, bountyGold: 28, bountyXp: 40,
    dropItemId: 'fur', dropChance: 0.8,
  },
  // Desert: fast, fragile, venomous predator.
  scorpion: {
    faction: 'predator', behavior: 'predator', hp: 55, speed: 4.4, wanderSpeed: 1.4,
    aggro: 11, leash: 16, fear: 0, melee: 1.1, attackDamage: 14, attackDuration: 0.4,
    attackCooldown: 0.9, turnRate: 10, pathRecompute: 0.4, waypointRadius: 0.4,
    scale: 0.4, collisionRadius: 0.28, blocks: false, bountyGold: 14, bountyXp: 22,
    dropItemId: 'venom', dropChance: 0.7,
  },
  // Swamp: neutral tank that ambush-charges when approached (boar branch).
  bog_croc: {
    faction: 'boar', behavior: 'boar', hp: 170, speed: 3.6, wanderSpeed: 0.8,
    aggro: 6, leash: 16, fear: 0, melee: 1.5, attackDamage: 20, attackDuration: 0.55,
    attackCooldown: 1.3, turnRate: 6, pathRecompute: 0.45, waypointRadius: 0.5,
    scale: 0.5, collisionRadius: 0.4, blocks: true, bountyGold: 20, bountyXp: 30,
    dropItemId: 'croc_steak', dropChance: 0.9,
  },
  // Forest: large grazer, flees (prey branch).
  elk: {
    faction: 'prey', behavior: 'prey', hp: 60, speed: 3.6, wanderSpeed: 1.2,
    aggro: 0, leash: 0, fear: 9, melee: 0, attackDamage: 0, attackDuration: 0,
    attackCooldown: 0, turnRate: 7, pathRecompute: 0.5, waypointRadius: 0.4,
    scale: 0.58, collisionRadius: 0.32, blocks: false, bountyGold: 12, bountyXp: 18,
    dropItemId: 'elk_jerky', dropChance: 0.9,
  },
  // Rock: nimble grazer, flees (prey branch).
  goat: {
    faction: 'prey', behavior: 'prey', hp: 40, speed: 3.9, wanderSpeed: 1.3,
    aggro: 0, leash: 0, fear: 8, melee: 0, attackDamage: 0, attackDuration: 0,
    attackCooldown: 0, turnRate: 9, pathRecompute: 0.5, waypointRadius: 0.4,
    scale: 0.42, collisionRadius: 0.28, blocks: false, bountyGold: 10, bountyXp: 14,
    dropItemId: 'goat_charm', dropChance: 0.6,
  },
  // Rock: very slow, very tanky; drops a weapon (boar branch).
  golem: {
    faction: 'boar', behavior: 'boar', hp: 280, speed: 2.4, wanderSpeed: 0.6,
    aggro: 5, leash: 14, fear: 0, melee: 1.7, attackDamage: 28, attackDuration: 0.7,
    attackCooldown: 1.6, turnRate: 5, pathRecompute: 0.5, waypointRadius: 0.5,
    scale: 0.6, collisionRadius: 0.46, blocks: true, bountyGold: 36, bountyXp: 55,
    dropItemId: 'stone_maul', dropChance: 0.5,
  },
```

- [ ] **Step 3: Spawn the drop on kill in `Character.tsx`**

In `src/world/Character.tsx`, add to the imports near `import { spawnImpact } from './impactStore'`:
```ts
import { spawnPickup } from './pickupStore'
```
In the `for (const animal of getAliveAnimals())` loop, inside the `if (died) {` block,
after the existing `addGold(c.bountyGold)` line, add:
```ts
              if (c.dropItemId && Math.random() < (c.dropChance ?? 1)) {
                spawnPickup(c.dropItemId, animal.x, animal.y, animal.z)
              }
```
(`c` is the existing `const c = ANIMAL_CONFIG[animal.species]` already in that block.)

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: PASS (exit 0). New species are config-only here; views come in Tasks 6–11.

- [ ] **Step 5: Commit**

```bash
git add src/world/animalConfig.ts src/world/Character.tsx
git commit -m "feat: 6 biome creature stat blocks + kill-drop roll"
```

---

## Tasks 6–11: Creature models (one per creature)

Each creature needs a `*View.tsx` model component. **These are hand-built box-mesh
models — use the `model-smith` skill to build and verify each one.** The Wolf
([src/world/Wolf.tsx](../../../src/world/Wolf.tsx)) is the canonical template: a
`{ state }: { state: AnimalState }` component that calls `stepAnimalAI(state, dt, tNow)`
each frame, animates limb groups from the returned `{moving, attacking, attackPhase}`,
applies cull + dead-fade, and shows an HP billboard. **Copy Wolf.tsx's full
structure** (imports, refs, `useFrame` body, HP bar, `scale={cfg.scale}`) and reshape
only the mesh tree + palette + `const cfg = ANIMAL_CONFIG.<species>`.

**The model-smith workflow for each (do all steps):**
1. Create `src/world/<Name>.tsx` copying Wolf.tsx, swapping `ANIMAL_CONFIG.wolf` →
   the new species and the colour consts + mesh tree.
2. Register it in `scripts/inspect-model.tsx`: add the import and a `REGISTRY` line
   `('<Name>': () => <NameView state={createAnimal('<species>', 0, 0, 1)} />)` — note
   `createAnimal` and the view are both imported there (mirror the existing Wolf/Deer
   registry lines, which already import `createAnimal` from `./animalStore`).
3. Run `npm run inspect <Name>` and fix every FAIL/WARN (floating parts, sunk base,
   NaN). Re-run until `0 FAIL`.

Build dimensions (1 unit = 1 tile; the outer group multiplies by `cfg.scale`, so build
the mesh tree at Wolf-like ~1-unit body proportions and let scale size it):

### Task 6: PolarBear.tsx
- Species `polar_bear`, behavior predator (Wolf animation mapping fits — chase + lunge).
- Palette: body `#eef2f6` (off-white), shadow `#c4ccd6`, snout `#b0b8c2`, nose `#141414`, eye `#2a2a2a`.
- Shape: bulkier than Wolf — torso box ~`[0.6, 0.6, 1.3]`, thick legs ~`[0.18, 0.55, 0.2]`, broad head ~`[0.42, 0.4, 0.42]`, small rounded ears (cones), short tail stub. No bushy tail.
- Files: Create `src/world/PolarBear.tsx`; Modify `scripts/inspect-model.tsx`.
- Verify: `npm run inspect PolarBear` → 0 FAIL.
- Commit: `git add src/world/PolarBear.tsx scripts/inspect-model.tsx && git commit -m "feat: PolarBear model"`

### Task 7: Scorpion.tsx
- Species `scorpion`, behavior predator (legs scuttle on the gait swing; the "attack"
  lunge drives the tail strike).
- Palette: carapace `#3a2a1a` / `#241a10`, claw `#4a3420`, stinger tip `#d24a4a` (emissive ok).
- Shape: low flat body box ~`[0.5, 0.18, 0.7]`; two front claw arms (cone+box pincers);
  6 thin legs as hip-pivot boxes (3 per side) animated on `swing`; a segmented tail of
  3–4 small boxes curving up to a cone stinger that swings forward on `attackPhase`.
  No HP-bar position change (keep Wolf's `y` ~1.0; scorpion is short, so lower the bar to ~0.7).
- Files: Create `src/world/Scorpion.tsx`; Modify `scripts/inspect-model.tsx`.
- Verify: `npm run inspect Scorpion` → 0 FAIL.
- Commit: `git add src/world/Scorpion.tsx scripts/inspect-model.tsx && git commit -m "feat: Scorpion model"`

### Task 8: BogCroc.tsx
- Species `bog_croc`, behavior boar (charges; reuse Wolf's lunge for the bite).
- Palette: hide `#3f5a36` / `#2a3d22`, belly `#8a9a5a`, teeth `#e8e4d0`, eye `#d8b020`.
- Shape: long low body ~`[0.5, 0.3, 1.6]`; flat broad snout (two stacked boxes) that
  opens on `attackPhase` (rotate an upper-jaw group); 4 short splayed legs; a long
  tapering tail of 3 boxes that sways on `swing`. Rows of small back-ridge cones.
- Files: Create `src/world/BogCroc.tsx`; Modify `scripts/inspect-model.tsx`.
- Verify: `npm run inspect BogCroc` → 0 FAIL.
- Commit: `git add src/world/BogCroc.tsx scripts/inspect-model.tsx && git commit -m "feat: BogCroc model"`

### Task 9: Elk.tsx
- Species `elk`, behavior prey (flees; Wolf's gait swing on the legs, no attack pose used).
- Palette: coat `#7a5230` / `#5a3a20`, underside `#b89a6a`, antler `#cbb088`, hoof `#2a2018`.
- Shape: tall deer-like — long legs ~`[0.12, 0.7, 0.13]`, slim torso ~`[0.36, 0.4, 1.0]`,
  raised neck box angled forward to a head; branching antlers built from several thin
  boxes/cones off the head. Short upright tail.
- Files: Create `src/world/Elk.tsx`; Modify `scripts/inspect-model.tsx`.
- Verify: `npm run inspect Elk` → 0 FAIL.
- Commit: `git add src/world/Elk.tsx scripts/inspect-model.tsx && git commit -m "feat: Elk model"`

### Task 10: Goat.tsx
- Species `goat`, behavior prey.
- Palette: wool `#d8d2c4` / `#b0a894`, horn `#8a7a5a`, hoof `#2a2018`, eye `#2a2a2a`.
- Shape: compact — torso ~`[0.34, 0.36, 0.7]`, four short legs, blocky head with a
  short beard box and two backward-curving horn cones. Small upright tail.
- Files: Create `src/world/Goat.tsx`; Modify `scripts/inspect-model.tsx`.
- Verify: `npm run inspect Goat` → 0 FAIL.
- Commit: `git add src/world/Goat.tsx scripts/inspect-model.tsx && git commit -m "feat: Goat model"`

### Task 11: Golem.tsx
- Species `golem`, behavior boar (slow charge + heavy swing; reuse Wolf's lunge on the arms).
- Palette: stone `#7d7e86` / `#5c5d64`, mossy accents `#5a6a3a`, eye/core `#7ad2ff` (emissive).
- Shape: bipedal-ish boulder — big torso box ~`[0.7, 0.7, 0.5]`, stubby legs, two heavy
  block arms (hip/shoulder-pivot groups animated on `swing`/lunge), small head with a
  glowing core box. Angular, no tail. Flat-shaded stone material.
- Files: Create `src/world/Golem.tsx`; Modify `scripts/inspect-model.tsx`.
- Verify: `npm run inspect Golem` → 0 FAIL.
- Commit: `git add src/world/Golem.tsx scripts/inspect-model.tsx && git commit -m "feat: Golem model"`

---

## Task 12: Spawn creatures in their biomes + view switch

Wires the 6 views into `WildAnimals.tsx` and places spawns in each biome REGION.

**Files:**
- Modify: `src/world/WildAnimals.tsx`

Biome region centres (from `tileMap.ts` REGIONS, post-Phase-1): snow `(28,22)`,
desert `(112,24)`, swamp `(72,94)`, forest SW `(34,78)` / SE `(116,86)`, rock W `(18,54)`
/ E `(124,56)` / N `(72,12)`. Spawns are placed on the *apron* (a few tiles off-centre,
on walkable low ground) and `findSpawnNear` snaps them clear of cliffs/props.

- [ ] **Step 1: Import the 6 views**

In `src/world/WildAnimals.tsx`, after the existing view imports
(`WolfView`/`DeerView`/`BoarView`/`RabbitView`), add:
```ts
import { PolarBearView } from './PolarBear'
import { ScorpionView } from './Scorpion'
import { BogCrocView } from './BogCroc'
import { ElkView } from './Elk'
import { GoatView } from './Goat'
import { GolemView } from './Golem'
```
(Each view is exported as `<Name>View` — match the export name you used in Tasks 6–11.
The plan assumes `export function PolarBearView(...)` etc., mirroring `WolfView`.)

- [ ] **Step 2: Add spawns to `ANIMAL_SPAWNS`**

Append to the `ANIMAL_SPAWNS` array (before its closing `]`):
```ts
  // ─── Biome signature creatures (Phase 2) ──────────────────────
  { species: 'polar_bear', pos: [40, 30], seed: 7.1 },
  { species: 'scorpion', pos: [104, 30], seed: 7.4 },
  { species: 'scorpion', pos: [110, 36], seed: 7.6 },
  { species: 'bog_croc', pos: [72, 86], seed: 8.2 },
  { species: 'elk', pos: [40, 72], seed: 8.5 },
  { species: 'elk', pos: [110, 80], seed: 8.8 },
  { species: 'goat', pos: [30, 50], seed: 9.1 },
  { species: 'goat', pos: [118, 60], seed: 9.3 },
  { species: 'golem', pos: [22, 58], seed: 9.6 },
```

- [ ] **Step 3: Extend the `AnimalView` switch**

In the `AnimalView` function's `switch (state.species)`, add cases before `default`:
```ts
    case 'polar_bear':
      return <PolarBearView state={state} />
    case 'scorpion':
      return <ScorpionView state={state} />
    case 'bog_croc':
      return <BogCrocView state={state} />
    case 'elk':
      return <ElkView state={state} />
    case 'goat':
      return <GoatView state={state} />
    case 'golem':
      return <GolemView state={state} />
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: PASS (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/world/WildAnimals.tsx
git commit -m "feat: spawn biome creatures + wire view switch"
```

---

## Task 13: Biome loot chests

Six themed chests, one per creature drop, reusing the existing `<Chest>`. Placed in
each biome; `Chest`'s own `findSpawnNear` snaps them off water/cliffs.

**Files:**
- Modify: `src/world/World.tsx`

- [ ] **Step 1: Add the chests**

In `src/world/World.tsx`, after the existing "Frontier chests" block of `<Chest>`
elements, add:
```tsx
        {/* Biome loot chests — one per creature drop, so each item is also
            findable by exploring (Phase 2). */}
        <Chest position={[34, 1, 30]} rotation={0.5} gold={8} loot={['fur']} />
        <Chest position={[106, 1, 28]} rotation={-0.6} gold={8} loot={['venom']} />
        <Chest position={[72, 1, 88]} rotation={1.3} gold={8} loot={['croc_steak']} />
        <Chest position={[40, 1, 74]} rotation={2.0} gold={8} loot={['elk_jerky']} />
        <Chest position={[120, 1, 58]} rotation={-1.4} gold={8} loot={['goat_charm']} />
        <Chest position={[24, 1, 56]} rotation={0.9} gold={10} loot={['stone_maul']} />
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/world/World.tsx
git commit -m "feat: biome loot chests"
```

---

## Task 14: Buff HUD pips

The one new UI element — buff pips, shown only while ≥1 buff is active.

**Files:**
- Create: `src/hud/BuffBar.tsx`
- Modify: `src/hud/Hud.tsx`
- Modify: `src/hud/hud.css`

- [ ] **Step 1: Write `BuffBar.tsx`**

`src/hud/BuffBar.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { getActiveBuffs, subscribeBuffs, type BuffKind } from '../world/buffStore'

// Buff pips — one per active buff (icon + a shrinking duration bar). Renders
// nothing when no buff is active, so there's no idle HUD chrome. Re-renders only
// when a buff is applied/expires (subscribe); the duration bar is driven by
// requestAnimationFrame, not React state, to avoid per-frame churn (PlayerHud pattern).

const ICON: Record<BuffKind, string> = { resist: '🛡️', power: '⚔️', haste: '💨' }
const LABEL: Record<BuffKind, string> = { resist: 'Resist', power: 'Power', haste: 'Haste' }
// Full duration per kind (ms) — matches inventoryStore item defs, for the bar ratio.
const FULL_MS: Record<BuffKind, number> = { resist: 12000, power: 12000, haste: 12000 }

export function BuffBar() {
  const [kinds, setKinds] = useState<BuffKind[]>([])
  const barRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Re-render the pip set on apply/expire.
  useEffect(() => {
    const sync = () => setKinds(getActiveBuffs(performance.now() * 0.001).map((b) => b.kind))
    sync()
    return subscribeBuffs(sync)
  }, [])

  // Drive the shrinking bars + prune expired pips via rAF.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const now = performance.now() * 0.001
      const active = getActiveBuffs(now)
      const activeKinds = active.map((b) => b.kind)
      // Prune when a buff expires (keeps the list in sync without a per-frame setState).
      if (activeKinds.length !== kinds.length) setKinds(activeKinds)
      for (const b of active) {
        const el = barRefs.current[b.kind]
        if (el) el.style.width = `${Math.min(100, (b.remain * 1000 / FULL_MS[b.kind]) * 100)}%`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [kinds])

  if (kinds.length === 0) return null

  return (
    <div className="buff-bar">
      {kinds.map((k) => (
        <div key={k} className="buff-pip" title={LABEL[k]}>
          <span className="buff-icon">{ICON[k]}</span>
          <div className="buff-dur">
            <div className="buff-dur-fill" ref={(el) => { barRefs.current[k] = el }} />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Mount it in `Hud.tsx`**

In `src/hud/Hud.tsx`, add the import:
```ts
import { BuffBar } from './BuffBar'
```
Add `<BuffBar />` inside the `.hud` div, right after `<Objective />`:
```tsx
      <Objective />
      <BuffBar />
```

- [ ] **Step 3: Add styles**

Append to `src/hud/hud.css`:
```css
/* Buff pips — only present while a buff is active (BuffBar returns null otherwise). */
.buff-bar {
  position: absolute;
  left: 16px;
  bottom: 84px;
  display: flex;
  gap: 8px;
  pointer-events: none;
}
.buff-pip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px 6px;
  background: rgba(20, 18, 24, 0.55);
  border-radius: 6px;
}
.buff-icon {
  font-size: 18px;
  line-height: 1;
}
.buff-dur {
  width: 26px;
  height: 4px;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 2px;
  overflow: hidden;
}
.buff-dur-fill {
  height: 100%;
  width: 100%;
  background: linear-gradient(180deg, #ffe27a 0%, #e0a83a 100%);
}
```
(`bottom: 84px` sits the pips just above the hotbar; nudge if it overlaps on your screen.)

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: PASS (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/hud/BuffBar.tsx src/hud/Hud.tsx src/hud/hud.css
git commit -m "feat: buff HUD pips (visible only while active)"
```

---

## Task 15: Reset wiring + final verification

Ground pickups and buffs are module singletons; like the other stores they must reset
on the world remount (HMR / new run) so they don't leak across runs. `WildAnimals.tsx`
already calls `resetAnimals()` on mount/unmount; `Pickups` resets itself on unmount
(Task 4). Buffs should clear on a fresh run.

**Files:**
- Modify: `src/world/playerStore.ts` (call `resetBuffs` from `resetPlayer`)

- [ ] **Step 1: Clear buffs on a fresh run**

In `src/world/playerStore.ts`, add to the imports:
```ts
import { getDamageTakenMult, resetBuffs } from './buffStore'
```
(merge with the import added in Task 3 — it becomes this single line). In `resetPlayer`,
after the existing `resetBlock()` call, add:
```ts
  resetBuffs()
```

- [ ] **Step 2: Full build + test**

Run: `npm run build`
Expected: PASS (exit 0).

Run: `npm run test`
Expected: `buffStore` 6/6 pass; `pathfinding` + `mapReachability` still pass. (The two
pre-existing `waveStore`/`waveLogic` failures are unrelated branch WIP — not introduced here.)

- [ ] **Step 3: All-models inspection gate**

Run each: `npm run inspect PolarBear`, `Scorpion`, `BogCroc`, `Elk`, `Goat`, `Golem`.
Expected: every model `0 FAIL`.

- [ ] **Step 4: Visual smoke check**

With the dev server running (`npm run dev`), run `npm run shot -- scripts/phase2.png "?capture"`
and view `scripts/phase2.png` to confirm the scene still renders with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/world/playerStore.ts
git commit -m "feat: clear buffs on fresh run; Phase 2 verification"
```

---

## Self-Review notes (already applied)

- **Spec coverage:** 6 creatures (Tasks 5–12), loot items (Task 2), kill-drops (Tasks 4–5),
  biome chests (Task 13), buffs + 3 hooks (Tasks 1–3), pickups (Task 4), buff HUD (Task 14),
  resets (Task 15). All spec sections map to a task.
- **Type consistency:** `BuffKind` ('resist'|'power'|'haste') defined in Task 1, imported in
  Tasks 2/14. `AnimalSpecies` widened once in Task 5; views keyed to those exact ids in
  Task 12. `dropItemId`/`dropChance` defined in Task 5, read in Task 5 step 3. Item ids
  (`fur`/`venom`/`goat_charm`/`croc_steak`/`elk_jerky`/`stone_maul`) consistent across Tasks
  2, 5, 13, and the pickup `TINT` map in Task 4.
- **Behavior↔faction:** every new species sets `faction === behavior` (one of predator/prey/
  boar), which `animalAI.ts` requires.
- **Model code:** Tasks 6–11 delegate to the model-smith skill with the Wolf template + exact
  per-creature specs and a `0 FAIL` inspect gate — the correct workflow for hand-built models
  (full box-by-box geometry can't be authored blind; it needs the inspect loop).
