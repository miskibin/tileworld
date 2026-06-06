# Tileworld → Bevy Port: Functional Requirements Checklist

> A complete, implementation-oriented spec of the current browser game (React 19 + R3F +
> three.js + TypeScript) intended as the master checklist for a Bevy (Rust) reimplementation.
> Every number here is pulled from the live source. Treat each `- [ ]` as a verifiable
> functional requirement. Sections are ordered roughly by porting dependency: engine
> scaffolding → world → entities → systems → UI/audio.
>
> **Determinism note:** the entire world is generated from pure `sin`/`cos` math — **no seed,
> no RNG, no noise library**. A correct port reproduces the same island every launch. Runtime
> randomness (animation jitter, loot rolls, spark velocities) uses `Math.random()` and is *not*
> required to match the original frame-for-frame.

---

## 0. Engine Scaffolding & Architecture

### 0.1 The store pattern → Bevy ECS mapping
The TS codebase has **no state library**. Every `src/world/*Store.ts` is a module-level external
store with two update channels. Map them as follows:

- [ ] **Hot-path stores** (read/mutated every frame, never notify): `playerStore`, `orkStore`,
      `animalStore`, `villagerStore`, `timeStore`, `hitStopStore`, `projectileStore`,
      `impactStore`, `orbStore`, `dustStore` → **Bevy `Resource`s / `Component`s** read with
      `Res`/`ResMut`/queries. No events.
- [ ] **Discrete stores** (mutate + `notify()` to re-render UI): `gameStore`, `pauseStore`,
      `waveStore`, `castleStore`, `cityStore`, `upgradeStore`, `resourceStore`, `inventoryStore`,
      `buffStore`, `shopStore`, `itemToastStore`, `successionStore` → **Bevy `Resource` + `Event`**;
      UI systems react to change detection / events.
- [ ] `subscribeX(fn)` semantics: adds listener, **immediately fires once** with current state,
      returns an unsubscribe fn. Bevy: emit an initial value on UI system startup.
- [ ] Getters return the **live mutable reference** (e.g. `getPlayer()`); callers read fields off
      it every frame. In Bevy this is just `Res<Player>` field access.

### 0.2 Frame loop & freeze gate
- [ ] No central loop; each entity owns a `useFrame`. In Bevy, split into systems per concern.
- [ ] **Every gameplay system must early-out when frozen.** `isFrozen()` = `paused` **OR** shop
      open **OR** upgrade tree open **OR** inventory open. World boots **paused** behind the
      StartScreen.
- [ ] **Hit-stop time scaling.** `getTimeScale()` returns `0` during a hit-stop window, else `1`.
      Every system multiplies its `dt` by this. Hit-stop is wall-clock based (`performance.now`),
      0.05 s on a normal hit, 0.09 s on a kill. Rendering continues during hit-stop.
- [ ] Game phases (`gameStore`): `'menu' | 'prep' | 'wave' | 'victory' | 'defeat'`. Victory/defeat
      auto-pause. `defeatReason`: `'keep'` (castle destroyed) or `'bloodline'` (hero died, no heirs).

### 0.3 Coordinate system
- [ ] Game logic works in **grid coords** on a `COLS=202 × ROWS=152` tile map (post-1.4×
      expansion; base layout is 144×108). Tile `(x,z)` center sits at world `(x+0.5, z+0.5)`.
- [ ] Map center: `CENTER_X = COLS/2 = 101`, `CENTER_Z = ROWS/2 = 76`.
- [ ] The whole scene is wrapped in one offset group `position = (-CENTER_X, 0, -CENTER_Z)` so the
      island center sits at the world origin (avoids float error at map scale). Most entities live
      *inside* this group in grid coords. **Outside** the group (world space): camera, distant
      mountains, skybox, birds, ships, post-processing, positional water audio.
- [ ] Vertical world-Y from height class: `tileTopY = 1 + (height-1) * GROUND_STEP`,
      `GROUND_STEP = 0.5`. Height 1 → Y 1.0; height 9 (snow peak) → 5.0; height 15 (rock peak) → 8.0.
      Tile tops are flat; neighbouring boxes stay flush.

### 0.4 Render quality & capture modes (optional for port)
- [ ] Quality tiers `'low' | 'medium' | 'high'` (`qualityStore`, persisted to localStorage, `G`
      cycles): low = no post/shadows; medium = full post + shadows; high = + reflective water,
      dense grass, fuller canopies.
- [ ] `?capture`/`?lite` drops post-stack + shadows + pins dpr=1 (headless screenshots); `?perf`
      shows perf overlay.

---

## 1. World, Map & Terrain Generation

### 1.1 Dimensions & scaling
- [ ] `COLS=202`, `ROWS=152`. Base map 144×108. `MAP_SCALE = 1.4` (per-axis ≈ 1.4028 / 1.4074).
- [ ] Generation runs in **base space**; three conversions: `toBase(x,z)` (grid→base),
      `fromBase(x,z)` (wilderness base→grid, scaled about base center 72,54 → enlarged center
      101,76), `shiftToCentre(x,z)` (castle base→grid, **pure translation, no scaling** — castle
      keeps absolute size).
- [ ] Tiles built once and cached. `tileAt(x,z)` → `Tile | null` (null = water/out of bounds).
- [ ] Two deterministic noise bands (output ∈ [-1.5, 1.5]):
      - `noiseA(x,z) = sin(x*0.13+1.7)*cos(z*0.11-2.3) + sin(x*0.31+z*0.29+4.5)*0.5`
      - `noiseB(x,z) = sin(x*0.21-3.1)*cos(z*0.19+0.7) + sin((x+z)*0.07+5.2)*0.4`

### 1.2 Island, coast, water
- [ ] Island = superellipse in base space: `(dx/71)^2.6 + (dz/53)^2.6 + noiseA*0.08 < 1.0`
      (`ISLAND_EXP = 2.6`, semi-axes 71×53).
- [ ] Sand beach ring 1–3 tiles inland (width from 2-octave noise); sand is walkable height 1.
- [ ] Two carved rivers (water, impassable without bridge):
      - Western N–S (~x40): `centerX(z) = 40 + sin(z*0.18)*5 + sin(z*0.07+1.4)*3`, width ~0.75–0.95.
      - Northern E–W (~z20): `centerZ(x) = 20 + sin(x*0.13+0.7)*4`, width ~0.7.
      - Rivers never cross castle safe-zone or mountain cores.
- [ ] One hand-placed oval lake SE of castle (base center 92,80, rx 5, rz 3).

### 1.3 Biome regions
- [ ] Five soft-edged circular biome blobs (radii are base; multiply by ~1.4 for enlarged):

  | Region | Base center | Radius | Biome | Peak height |
  |--------|-------------|--------|-------|-------------|
  | NW | (26,24) | 26 | snow | 9 |
  | NE | (112,28) | 34 | desert | 1 |
  | E | (122,58) | 22 | rock | 15 |
  | SW | (32,80) | 34 | forest | 1 |
  | S | (72,92) | 32 | swamp | 1 |

- [ ] `regionAt`: overlapping blobs resolve to nearest center (incl. wobble). Flat biomes get
      sinusoidal edge fray (amps ~1.1 coarse + 1.6 medium + 1.0 fine); mountains (rock/snow) skip
      fray to keep ramp corridors + river avoidance crisp.
- [ ] Scattered grass-belt forest: fine perlin-ish noise fills open grass gaps (height 1, forest).

### 1.4 Castle safe zone
- [ ] Castle center grid (101,76) (base 72,54). `CASTLE_SAFE_R = 18` base (~25 enlarged): forced
      flat grass, no river/lake/mountain/blob intrudes; soft grass↔desert interlock at edge, inner
      core (≥~14) always pure grass.
- [ ] `CASTLE_BOUNDS` base x∈[59,85], z∈[45,63] (26×18). Keep, walls, gates, houses, towers placed
      at absolute size via `shiftToCentre`.

### 1.5 Mountains, ramps, hills
- [ ] Each mountain has **one guaranteed climbable ramp** to summit. `RAMP_HALF_TILES = 1.7`
      (~3.4-wide trail). Staircase: `climbableHeight = 2 + floor((radius - dist)/step)`,
      `step = radius/(peak-2)` (snow 3.71, rock 1.69) → every adjacent corridor tile differs ≤1.
- [ ] Ramp azimuth defaults to facing the castle; `rampAng` override per region.
- [ ] Non-ramp faces use quadratic + noise profile → Δ≥2 cliffs (impassable); shallow aprons climbable.
- [ ] Two hand-placed climbable grass hills: SE base (98,72) r9 peak5; W base (52,50) r7 peak4.
      Concentric terraces, foot height 2, each ring +1 class.

### 1.6 Generation pipeline order (deterministic)
- [ ] 1 land mask → 2 castle safe-zone (forced grass+fray) → 3 rivers → 4 lake → 5 coast distance →
      6 beach ring → 7 grass hills → 8 regional biomes (nearest center, mountain quadratic profile)
      → 9 scattered forest fill → 10 fallback grass → 11 **height resampled at rounded base-tile
      center** so discrete plateaus/cliffs survive the 1.4× stretch → 12 cache.

### 1.7 Landmarks (one signature monument per biome)
- [ ] Components + base→enlarged positions, footprint radius `r`:

  | Landmark | Base→enlarged | r | Biome |
  |----------|---------------|---|-------|
  | FrozenSpire | (26,24)→(37,34) | 2 | snow |
  | SunkenPyramid | (122,22)→(171,31) | 3 | desert |
  | StandingStones | (118,82)→(165,115) | 2 | rock |
  | GiantDeadTree | (72,100)→(101,140) | 1 | swamp |
  | RuinedShrine | (22,88)→(31,123) | 2 | forest |

- [ ] Each registers an AABB blocker (center±r) **unless** it overlaps a road or ramp corridor
      (then skipped). Scatter reserved with r+1 margin.
- [ ] Other scenery components (port as static meshes): `DistantMountains` (backdrop, no collision),
      `Boat`/Ships, `Campfire`, `Tent`, `Grave`, `Garden`, `StandingStones`.

### 1.8 Frontier gradient
- [ ] `frontierFactor(x,z) ∈ [0,1]`: 0 inside safe-zone, smoothstep to 1 at `RIM_DIST = ROWS*0.68 ≈ 103`.
      `t = clamp((d-CASTLE_SAFE_R)/(RIM_DIST-CASTLE_SAFE_R),0,1); return t*t*(3-2t)`.
- [ ] Drives: camp/animal HP multiplier `×(1+factor)` (≈2× at rim), live damage scaling, and loot
      tier (tier0 ≤0.4, tier1 ≤0.7, tier2 >0.7 = rim-only top gear).

---

## 2. Navigation (A* Pathfinding)

- [ ] 8-directional grid A*. Cost 1 orthogonal, √2 diagonal. Heuristic = Euclidean to goal.
      Node budget `maxNodes = 800` (local pathing; returns `[]` if exhausted).
- [ ] Waypoints returned at tile centers (x.5, z.5).
- [ ] `isWalkable(x,z)`: in bounds, no house/AABB footprint at center, no collidable obstacle on
      tile, terrain standable (land height ≥1 or bridge deck).
- [ ] `canStep(from,to)` climb gate (symmetric, shared by pathing & mob movement): target standable
      AND `|Δheight| ≤ 1`. Δ≥2 faces impassable.
- [ ] **Player variant `canStepOrDrop`**: may drop *any* height (gravity + fall damage) but still
      cannot climb >1 class. Mobs use symmetric `canStep` (never path off cliffs).
- [ ] Diagonal corner-cut constraint: a diagonal step requires *both* orthogonal neighbours
      walkable+climbable.
- [ ] Thin-wall handling: city walls are thin AABBs on tile edges; A* also tests the midpoint
      between two cells so it can't squeeze a diagonal past a wall that misses both centers. Gate
      gaps register no blocker → straight through.
- [ ] Unwalkable start/goal snapped to nearest walkable within ring radius 5 (`nearestWalkable`).
- [ ] Bridges register walkable water tiles (`bridgeAt`). House/structure footprints register AABB
      blockers per-owner layer, cleared on unmount.
- [ ] `findSpawnNear(x,z,maxR=8)`: ring-search to nearest standable, obstacle-free tile.
- [ ] **Invariant test to port:** flood-fill from castle south gate reaches every biome foot, both
      mountain summits, all road bridges, all 3 ork camps.

### 2.1 Roads & bridges
- [ ] 11 orthogonal polyline route segments from the 4 castle gates (N 72,45 / S 72,63 / W 59,54 /
      E 85,54 base) to hamlet, trader market, biome feet, camps. Road tiles = dirt (land) / bridged
      (water). All road tiles reserved from scatter.
- [ ] Bridge auto-gen: a consecutive water run on a road segment is bracketed by land endpoints →
      one `RoadBridge { fromX,fromZ,toX,toZ }`, expanded to a ~3-tile-wide deck at y=1.0.

### 2.2 Obstacle scatter
- [ ] Deterministic per-biome roll table (seed constant 2027). Per-biome densities (sample):
      forest densest (trees 34%, birch 14%, bushes 16%, mushroom 28%…); grass sparse (tuft 57%);
      desert (cactus 7%, bones 6%); snow (snowPine 18%, iceShard 10%); swamp (deadtree 14%, reeds
      20%, mushroom 14%); rock (boulder 16%, rock 24%).
- [ ] Collision radii: trees/birch/snowPine 0.12; boulders/cactus 0.18–0.34; rock/bush/mushroom/
      flower/tuft/bones/reeds/iceShard = 0 (walk-through decor).
- [ ] Thinning: trees drop 65% (+15% in forest); collidable props drop 30%; decor untouched.
      Clustering for mushroom/flower/tuft (size 1–4 by biome).
- [ ] Reserved (no scatter): castle interior, road tiles, ramp corridors, 7×7 around each camp,
      landmark r+1, hamlet/market/trader-village boxes.
- [ ] Collidable obstacles binned per tile for O(9) spatial queries.

### 2.3 Culling
- [ ] `CULL_DIST = 46` tiles from player. Beyond it: hide mesh + freeze matrix auto-update + skip
      AI/animation. Re-enable on re-entry. Disabled during shader warmup.

---

## 3. Player & Combat

### 3.1 Stats, progression, succession-carried state
- [ ] Starting: `PLAYER_MAX_HP=125`, `PLAYER_BASE_DAMAGE=25`, `PLAYER_STARTING_GOLD=30`,
      spawn `{x:101, y:1, z:80}`.
- [ ] Level growth: `HP_PER_LEVEL=14`, `DAMAGE_PER_LEVEL=6`. XP per ork base `XP_PER_ORK=20`.
      `xpToNext = XP_FIRST_LEVEL(50) * level` (linear). Level-up heals to full (unless dead).
- [ ] Player live fields: x,y,z, facing, moving, hp, maxHp, hurtFlashUntil, deadSince, gold, level,
      xp, xpToNext, attackDamage, levelUpFlashUntil, **upgrade flags**: critChance, lifesteal,
      moveSpeedMult, cleave, bountyMult.
- [ ] Across runs (succession): gold, level, xp, maxHp bonus, attackDamage bonus persist. Per-run
      upgrade flags (crit/lifesteal/swift/cleave/bounty) reset each new run.

### 3.2 Movement & physics
- [ ] `SPEED=3.5` tiles/s; `SPRINT_MULT=1.75` (Shift); `TURN_RATE=12`.
- [ ] `GRAVITY=20`, `JUMP_SPEED=6.5` (rise ~1.06, never self-damages). Fall damage: past
      `FALL_SAFE=1.1`, `16/unit`, cap `FALL_DMG_MAX=45`.
- [ ] Swamp tile: move `×SWAMP_SLOW=0.75`; poison `2 HP` every `2.5 s`.
- [ ] `PLAYER_RADIUS=0.22`. Movement uses per-axis slide; `canStepOrDrop` for verticals.
- [ ] Footsteps: `STEP_FREQ=7`, one per half-cycle alternating legs; dust on loose ground
      (sand/snow/scree), sprint, and landings (>0.25 fall).

### 3.3 Attack (melee swing)
- [ ] `ATTACK_DURATION=0.45 s` (scaled by hit-stop), `ATTACK_RANGE=1.8`, cone `ATTACK_CONE_DOT=0.5`
      (60° forward). Damage resolved once per swing at phase ≥ 0.3.
- [ ] Damage = `(attackDamage + weaponBonus) × powerBuffMult`, then crit roll (`< critChance` → ×2),
      `round()`. White float for normal, gold `"N!"` for crit.
- [ ] Weapon bonuses: iron +11, golden +21, axe +15, stone_maul +18, frost +34, fists/starter +0.
- [ ] Knockback to living orks: 6 (crit) / 4 (normal); cleave splash 3.
- [ ] Cleave: if `cleave>0` and a direct hit landed, `round(baseDmg×cleave)` to orks within 2.0 of
      any direct-hit ork (skip direct-hit ones).
- [ ] Swing scan also hits: ore boulders (mining), bears, wild animals, enemy dogs.
- [ ] Feedback: hit → playHit + 0.3 trauma + 0.05 hit-stop + 0.65° FOV punch; kill → playKill +
      0.55 trauma + 0.09 hit-stop + 1.3° FOV; ore → playPick (same as hit); whiff → playSwing only.
- [ ] On ork kill: gold `round(baseGold × bountyMult)` (grunt 8/scout 6/zerk 14/shaman 18),
      XP per variant (20/14/30/34, no mult), lifesteal heal, 4% Mercenary Contract drop. Rewards
      burst as homing orbs; gold/xp land when orbs arrive.

### 3.4 Shield block
- [ ] `BLOCK_STAMINA_MAX=1`; drain hold `0.3/s`, per blocked hit `0.18`; regen `0.34/s` after
      `0.6 s` delay; unlock threshold `0.25`; `BLOCK_REDUCTION=0.85` (15% leaks); cone dot `0.3` (~72°).
- [ ] Right-mouse held = want-block; active only if stamina>0 & not locked & alive. Blocked frontal
      hit: damage ×0.15, extra −0.18 stamina, "BLOCK" float, playBlock + 0.1 trauma. Empty → locked
      until refilled to 0.25.

### 3.5 Damage taken & death
- [ ] Incoming = `amount × damageTakenMult × armorDamageMult` (then block if frontal).
      `damageTakenMult` = 0.6 if Resist buff else 1. `armorDamageMult` = `1 - armorDefense`.
- [ ] On hit: red `-N` float, hurtFlash 0.35 s, playPlayerHit+playHurt, 0.22 trauma, grade wince
      ≤0.6, hurt voice.
- [ ] On hp 0: `deadSince=now`, playPlayerDeath, body tilt over 0.6 s. Triggers succession (§7.3).
      `PLAYER_RESPAWN_DELAY=2.4 s`.

### 3.6 Buffs
- [ ] Three kinds, lazy expiry checked against `performance.now()`:
      Resist `mag 0.6` (damage taken ×), Power `mag 1.4` (damage dealt ×), Haste `mag 1.3` (speed ×).
      Item-applied durations 12 s (Marsh Herb resist 14 s). Keys Z/X/C.
- [ ] Multiplier getters used hot-path: `getDamageTakenMult`, `getDamageDealtMult`, `getSpeedMult`.

### 3.7 Input & camera
- [ ] Keyboard: WASD/arrows move, Space jump, Shift sprint. Q eat, Z/X/C buffs, I inventory,
      E interact, Esc pause, G quality, F8 money cheat, F9 path debug. Left-click attack,
      right-click hold block. Ctrl+scroll zoom.
- [ ] Mouse-look camera: pointer-lock (Esc/HUD releases). `SENS_X=0.0035`, `SENS_Y=0.0014`, polar
      ∈[0.18, π/2−0.07], azimuth full 360°, orbit dist 8–150. `REST_FOV=32°`. FOV punches: +0.65 hit,
      +1.3 kill, +1.1 land; max +7; decay 22°/s. Camera looks at `playerY+1`.

### 3.8 Player avatar mesh & animation (procedural skeleton, scale 0.5)
- [ ] Parts: 2 legs (hip pivot), belt, body (breathes+leans), 2 arms (shoulder pivot, right holds
      weapon group), decoupled shield group, head (visor + crest). See `Character.tsx` for box dims.
- [ ] Animation drivers (all in one update): leg swing ±0.7·movingAmt; arm swing ±0.55 opposite +
      idle sway; body breathe (idle) + forward lean 0.18·moving; head idle look; body bob (idle 0.025
      / walk |sin|·0.05); idle sword tap; 3-phase attack arm override (windup 0–0.2, strike 0.2–0.55
      hit@0.3, return 0.55–1); shield lerp rest↔block pose; death forward tilt to π/2.

---

## 4. Enemies (Orks, Shamans, Golems, Camps, Projectiles)

### 4.1 Ork data & variants (`orkConfig`)
- [ ] `OrkState` fields: id, x/y/z, facing, hp/maxHp, hurtFlashUntil, kbVX/kbVZ, variant, faction
      (`'red'|'blue'`), home `{x,z}|null`, seed, collisionRadius, attackingSince, attackReadyAt,
      attackHitDealt, healReadyAt (shaman), path[], pathIndex, pathRecomputeAt.
- [ ] Camp orks (`home` set): HP `×(1+frontierFactor)`. Wave orks (`home=null`): raw config HP.
- [ ] Hurt flash 0.25 s. Knockback decays `×max(0,1-9·dt)`, zeroed below 0.05.

  | Variant | HP | Dmg | Speed | Aggro | Melee | TurnRate | AtkDur | AtkCD | Scale | Skin | Gold | XP | Special |
  |---------|----|-----|-------|-------|-------|----------|--------|-------|-------|------|------|----|---------|
  | grunt | 254 | 24 | 2.3 | 9 | 1.5 | 6 | 0.7 | 1.6 | 1.0 | #3a6a2a | 8 | 20 | — |
  | scout | 136 | 15 | 3.3 | 13 | 1.4 | 9 | 0.5 | 1.0 | 0.78 | #5f9a3c | 6 | 14 | fast |
  | berserker | 306 | 30 | 2.6 | 10 | 1.5 | 7 | 0.45 | 0.85 | 1.06 | #7a3a26 | 14 | 30 | frenzy <40% HP: speed ×1.4, CD ×0.6 |
  | shaman | 201 | 26 | 1.8 | 15 | 11* | 5 | 0.6 | 2.1 | 0.96 | #6a3f86 | 18 | 34 | ranged 12, heal 24/5s/range8 |

  *shaman "melee" 11 = preferred cast distance; not a melee reach.

### 4.2 Ork AI state machine (per frame)
- [ ] Target priority (closest of each, within aggro): player (wave orks only at close range) →
      rival-faction ork → defender (militia/tower; **shamans ignore defenders**) → home anchor (if
      strayed >2.2 from home) → castle core (wave default; distance measured to AABB edge).
- [ ] Soft target behind a wall (`wallBetween`) → can't strike, path to gate instead.
- [ ] Trigger range: shaman `rangedRange`(12); tower `melee+1.2`; else `melee`. `inRange = hasTarget
      && dist<trigger && !losBlocked`.
- [ ] Face target lerp at `turnRate`. Start swing when `!attacking && inRange && now≥attackReadyAt`
      (throttled grunt SFX, 1.2 s gap).
- [ ] Shaman healing each frame on cooldown: nearest wounded ally in range8 → `healOrk(+24)`, float
      "+24", `healReadyAt = now+5` (or +1 if none).
- [ ] Chase: A* recompute every `pathRecompute` (~0.4–0.55 s) or when path exhausted; advance
      waypoint within `waypointRadius`(0.45); per-axis collision slide; wedge recovery forces recompute.
- [ ] Attack resolution: `phase=(now-attackingSince)/attackDur`; damage at `phase≥0.55` (once):
      shaman spawns homing bolt from `y+1.7` (range `rangedRange+4`); melee hits player
      (`damagePlayer`, blockable), ork, villager, tower (impact #b8b4ac), or castle (`damageCastle`,
      impact #9c7a48). At `phase≥1`: reset, `attackReadyAt=now+CD` (frenzy mult applies).

### 4.3 Ork camps & cages
- [ ] 3 camps on flat aprons: N base (74,26)→(104,36) snow; NE (104,32)→(146,45) desert; SW
      (34,72)→(48,101) forest. 7×7 reserved clearing each.
- [ ] Each camp spawns 4 home-anchored orks (grunt, scout, berserker, shaman) at warped local
      offsets, `home = camp center`, faction blue (= wave faction, so they don't brawl with invaders).
- [ ] Respawn: 60 s after all camp orks die **and** only if player >40 tiles away. Cage stays empty
      once freed (orks respawn, captives don't).
- [ ] CampCage: span W=1.7×H=1.5, door hinge rotates `-openAmount*1.5`. Poll every 0.4 s; once
      guards seen then all dead → `freeCaptive` (1 militia + rest flee), float "1 rescued · N fled".
      Registers a solid blocker.

### 4.4 Projectiles (`projectileStore`)
- [ ] Homing bolts: fields x/y/z, target (`player`|`ork ref`), team (`ork`|`defender`), speed
      (default 9), damage, ttl (3 s), maxRange (default 40), traveled, originX/Z (for block direction).
- [ ] Step: ttl down; fizzle if target dead or ttl≤0; hit at dist <0.6 (`HIT_RADIUS`) → apply
      damage; else move toward target head (`y+1`), accumulate `traveled`, fizzle at maxRange; clamp
      above terrain (`tileTopY+0.4`).
- [ ] Render: icosahedron 0.14, ork purple (#c89cff/emissive #7a3aff), defender cyan
      (#bfeeff/#2aa6ff), pulse `1+sin(t*18)*0.15`, instanced ≤32/team.

### 4.5 Impact sparks (`impactStore`)
- [ ] `spawnImpact(x,y,z,{count=10,color=#ffd27a,spread=3.2,size=1,up=1.4})`. Pool 240 (oldest
      dropped). Per-shard life 0.32–0.54 s, radial velocity, upward bias.
- [ ] Step: drag `×max(0,1-2.4·dt)`, gravity `-11`, soft ground bounce at y=0.05 (vy×-0.3, vxz×0.5).
      Render tetra 0.09, basic material no-tonemap (bloom), scale `size*0.6*(1-progress)²`, spin 9 rad/s.

### 4.6 Golem (rock elemental; uses boar AI)
- [ ] Stats: HP 280, speed 2.4, wander 0.6, aggro 5, leash 14, melee 1.7, dmg 28, atkDur 0.7,
      atkCD 1.6, turn 5, scale 0.6, radius 0.46, blocks. Bounty 36 gold / 55 xp.
      Drops: stone_maul 50%, iron_armor 40%. (Full mesh/anim in §5.)

### 4.7 Factions
- [ ] Orks: `orksHostile(a,b) = a!==b`. `WAVE_FACTION='blue'` (invaders + camp guards same color →
      no infighting en route). Colors red #9a2a22 / blue #26468f.
- [ ] Animals: `preysOn(predator, prey)=true`; `threatensPrey(f)= predator||boar`. Animals ignore
      orks and vice-versa.

---

## 5. Wildlife & Animals

### 5.1 Species table (`animalConfig`)
- [ ] 10 species, shared store + AI. Respawn delay **35 s**. HP scaled by `×(1+frontierFactor)` at
      spawn; damage scaled live.

  | Species | Faction | Behavior | HP | Chase/Flee | Wander | Aggro | Leash | Fear | Melee | Dmg | AtkDur | AtkCD | Scale | Radius | Blocks | Gold | XP | Drops (chance) |
  |---------|---------|----------|----|-----------|--------|-------|-------|------|-------|-----|--------|-------|-------|--------|--------|------|----|----|
  | wolf | predator | predator | 80 | 3.8 | 1.1 | 12 | 18 | — | 1.4 | 12 | 0.5 | 1.1 | 0.48 | 0.32 | ✓ | 12 | 22 | — |
  | deer | prey | prey | 45 | 3.5 | 1.3 | — | — | 8 | — | 0 | — | — | 0.5 | 0.3 | ✗ | 10 | 14 | — |
  | rabbit | prey | prey | 8 | 4.0 | 1.4 | — | — | 6 | — | 0 | — | — | 0.4 | 0 | ✗ | 3 | 5 | — |
  | boar | boar | boar | 140 | 3.2 | 0.9 | 5 | 16 | — | 1.5 | 18 | 0.6 | 1.4 | 0.48 | 0.4 | ✓ | 16 | 26 | — |
  | polar_bear | predator | predator | 200 | 3.0 | 0.9 | 13 | 20 | — | 1.6 | 24 | 0.6 | 1.4 | 0.62 | 0.42 | ✓ | 28 | 40 | fur(.8), leather_armor(.5) |
  | scorpion | predator | predator | 55 | 4.4 | 1.4 | 11 | 16 | — | 1.1 | 14 | 0.4 | 0.9 | 0.28 | 0 | ✗ | 14 | 22 | venom(.7) |
  | bog_croc | boar | boar | 170 | 3.6 | 0.8 | 6 | 16 | — | 1.5 | 20 | 0.55 | 1.3 | 0.5 | 0.4 | ✓ | 20 | 30 | croc_steak(.9) |
  | elk | prey | prey | 60 | 3.6 | 1.2 | — | — | 9 | — | 0 | — | — | 0.58 | 0.32 | ✗ | 12 | 18 | elk_jerky(.9) |
  | goat | prey | prey | 40 | 3.9 | 1.3 | — | — | 8 | — | 0 | — | — | 0.42 | 0.28 | ✗ | 10 | 14 | goat_charm(.6) |
  | golem | boar | boar | 280 | 2.4 | 0.6 | 5 | 14 | — | 1.7 | 28 | 0.7 | 1.6 | 0.6 | 0.46 | ✓ | 36 | 55 | stone_maul(.5), iron_armor(.4) |

- [ ] Fixed spawn lists per species (base coords, scaled, snapped via `findSpawnNear`) — see
      `animalStore`/`WildAnimals` for ~25 spawn points.

### 5.2 Shared AI (`animalAI.stepAnimalAI`, returns `{moving, attacking, attackPhase}`)
- [ ] **Predator**: player within aggro → if in melee, face + swing on cooldown; else A* chase; no
      target → wander (random tile 2–7 away, idle 2–6 s).
- [ ] **Prey**: scan nearest threat in fear range (predators, bears, player) → flee directly away at
      full speed; on hit → panic (drop target, idleUntil=now+0.2).
- [ ] **Boar/croc/golem**: neutral wander; player in aggro → enrage `now+5`; while enraged & player
      in leash → chase/attack; on hit → enrage `now+8`; calm when timer expires or player past leash.
- [ ] Melee hit at `attackPhase≥0.5` (once) if dist ≤ `melee+0.3`: `damagePlayer(dmg×(1+frontier))`.
      Movement = per-axis slide respecting terrain/obstacles/houses/bridges; auto-settle height; face
      lerp at turnRate.
- [ ] Death: fade 1.4 s (opacity→0, sink 0.4, rotate π/2) → `reapAnimal`; roll drops; grant bounty;
      respawn after 35 s at spawn.

### 5.3 Per-animal meshes & animation
- [ ] Each animal is a procedural quadruped/biped with 4 leg pivots (lf/rf/lb/rb), head, tail, HP
      bar. Gait freq per species (wolf/polar/goat 12, deer 13, boar 11, elk/golem 10, croc 8,
      scorpion 14). Idle sway, walk leg-swing + body bob (~0.04–0.06), attack front-leg lunge
      `sin(phase·π)·0.9` + body rock + head nod. Specific colors/shapes per `Bear/PolarBear/Boar/
      Deer/Elk/Goat/Rabbit/Wolf/Scorpion/BogCroc/Golem` components (port mesh-for-mesh).
- [ ] HP bar billboard, camera-facing, shown only when hp<maxHp.

### 5.4 Dogs, cats, birds (ambient)
- [ ] Dogs (`dogStore`/Wildlife): 60 HP, speed 1.3, radius 0.15, 10 dogs in 4 palettes near NW
      hamlet/grass belt. Wander (2–8 tiles, idle 1.5–4.5 s), no combat, bark near player. Tail/head/
      leg anim.
- [ ] Cats (`Cat`): ambient; stalking can scare birds.
- [ ] Birds (`Birds`): 5 flocks ×4–5 (≈23) instanced, circular orbits speed 0.24–0.4 r8–13, occasional
      dive/land; no collision.
- [ ] Bears (`bearStore`/Bear): roar on aggro, growl on attack; do NOT trigger combat music.

---

## 6. Waves, Defense, Economy & Upgrades

### 6.1 Day/prep → night/wave cycle
- [ ] `PREP_DURATION = 150 s` free-roam day window. Ends on timer or War Bell (`E` in range during
      prep → `requestPrepSkip`). Wave phase = night; ends when all orks spawned + field cleared.
- [ ] 8 waves total (index 0–7). Wave 7 = boss. Victory after wave 7 cleared.

### 6.2 Wave scaling & composition (`waveLogic`)
- [ ] Spawned HP = `round(baseHP × hpScale)`. Spawn from ring 30 tiles around keep (golden-angle).

  | Wave | Count | hpScale | Interval | Variant pool (round-robin) |
  |------|-------|---------|----------|----------------------------|
  | 0 | 6 | 1.0 | 1.2 | grunt,grunt,scout,grunt |
  | 1 | 8 | 1.18 | 1.1 | grunt,scout,grunt,berserker |
  | 2 | 12 | 1.45 | 1.1 | grunt,scout,berserker,shaman |
  | 3 | 15 | 1.67 | 1.0 | grunt,berserker,scout,shaman |
  | 4 | 18 | 1.92 | 0.95 | berserker,scout,grunt,shaman |
  | 5 | 22 | 2.21 | 0.85 | berserker,scout,shaman,grunt |
  | 6 | 26 | 2.54 | 0.75 | berserker,shaman,scout,grunt |
  | 7 | 1 | 14.0 | 0.5 | berserker (boss ≈ 4284 HP) |

- [ ] Wave-clear rewards: Tax Office +25 gold/wave; Granary Farm +3 bread/wave.

### 6.3 Economy
- [ ] **Gold** sources: start 30, ork bounties ×bountyMult (×1.5 with Bounty upgrade), Tax Office.
      Sinks: upgrades, shop consumables/weapons. `unlimitedMoney` cheat makes spend always succeed.
- [ ] **Stone** (`resourceStore`): from ore boulders, 8 stone/node, node HP 500, radius 0.4 (blocks),
      mined via melee swing scan. Sinks: defense upgrades (walls 20, gate 10, towers 25, reinforce 30).

### 6.4 Upgrade tree (`upgradeStore`, costs ×`UPGRADE_COST_SCALE=1.6` rounded to 5)
- [ ] **Economy:** eco_district_1..4 (30/70/130/190, +house+villager, max 4 houses), eco_farm 55
      (+3 bread/wave), eco_bounty 95 (×1.5 gold), eco_tax_office 120 (+25/wave), eco_merchant_guild
      110 (shop ×0.8). Villager arms: def_armor_1 65 (dmg+16, aggro+1.5), def_armor_2 145 (dmg+23).
- [ ] **Defense:** def_walls 80+20s, def_gate 55+10s (req walls), def_towers 130+25s (req walls),
      def_tower_mastery 190 (req towers), def_keep_archers 160, def_reinforce 210+30s (+350 castle HP
      + prep self-repair), def_ballista 175, def_shrine 150.
- [ ] **Hero:** hero_hp_1 50 (+18), hero_hp_2 110 (+35), hero_dmg_1 50 (+4), hero_dmg_2 110 (+7),
      hero_crit 130 (14%, req dmg_1), hero_lifesteal 145 (+7/kill, req hp_1), hero_swift 95 (×1.13),
      hero_cleave 175 (21% splash, req dmg_2).
- [ ] **Arsenal:** ars_axe 80 (Battle Axe in shop), ars_sword 145 (Golden Blade, req axe).
- [ ] Branch UI labels: Prosperity 🌾, Bulwark 🛡️, Champion ⚔️, Armoury 🏪. `payCosts` deducts
      gold + stone; `purchase(node)` gated by prereqs + affordability.

### 6.5 Defensive structures
- [ ] **Watchtowers** (4 corners, req walls): base range 18 / dmg 7 / CD 1.6 / maxRange 22 / bolt 11;
      with Tower Mastery range 24 / dmg 12 / CD 1.0 / maxRange 28. `TOWER_MAX_HP=180`, rebuilt each
      prep (`reviveTowers`); orks can destroy them.
- [ ] **Keep Archers** (4 roof corners): range 13 / dmg 6 / CD 1.7 / maxRange 16 / bolt 12.
- [ ] **Ballista** (north gate ~72,42.5): range 24 / dmg 45 / CD 2.6 / maxRange 28 / bolt 16; turret
      swivels; fog-culled when player far.
- [ ] **Healing Shrine** (interior E of keep): heals player `HEAL_PER_SEC=4` while inside city walls;
      fractional accumulator. Floating crystal hover+spin, no point light.
- [ ] All defenders pick nearest alive ork in range, fire `team:'defender'` bolts.

### 6.6 Castle / win-lose (`castleStore`, `gameStore`)
- [ ] `CASTLE_MAX_HP=650` (+350 with Reinforce → 1000). Reinforce adds prep self-repair `6 HP/s`.
      Keep destruction stages at >66% / 33–66% / ≤33% (merlons knocked off, rubble, smoke).
- [ ] **Defeat:** castle hp ≤0 during wave → reason `'keep'`; OR hero dies with no standing
      villagers → reason `'bloodline'`. **Victory:** wave 7 fully spawned + all enemies dead.

---

## 7. Villagers, City & Succession

### 7.1 Villagers (`villagerStore`, `Villager`)
- [ ] `VILLAGER_MAX_HP=140`. Fields incl. x/y/z, facing, home/door/garden XZ, state machine, path,
      seed, paletteIndex, recruited, isGuard (= home inside castle), hp, downed, attack timers.
- [ ] Daily schedule (period 60 s, `(t/60)%1`): [0,0.4) tend, [0.4,0.6) wander, [0.6,0.65) rest,
      [0.65,1) home (hidden, door open). State durations randomized (tend 3.5+2, wander 4+3, rest
      2+1.5, home 6+4). Tend wobbles ±0.4 around garden; wander random within `WANDER_RADIUS=3`.
- [ ] Movement: `SPEED=1.6`, `ARRIVE_DIST=0.35`, `WAYPOINT_DIST=0.4`, `PATH_RECOMPUTE=0.8`,
      `DOOR_OPEN_DURATION=1.8`.
- [ ] **Guards** (castle-home villagers): break routine to fight. `GUARD_AGGRO=7.5` (+3.5/armor
      tier), `GUARD_DEFEND_RADIUS=12` (×1.8 during waves), `GUARD_MELEE=1.45`, `GUARD_SPEED=2.4`,
      `GUARD_ATTACK_DURATION=0.55`, `GUARD_ATTACK_COOLDOWN=1.0`, `GUARD_DAMAGE=9` (+7/tier). Damage at
      swing phase 0.5. Can be downed by orks; `reviveVillagers()` at each prep.
- [ ] Townsfolk are invulnerable to orks (never targeted). Both types are succession heirs.
- [ ] Mesh: legs/body/arms/head with walk swings; armor tiers (0 tunic, 1 iron + sword, 2 steel);
      recruited villagers wear green tabard (#2f7a44 + gold trim). Palettes per `paletteIndex`.

### 7.2 Recruit & rescue
- [ ] `recruitTrader(t)`: spends one `mercenary_contract`; converts trader → castle militia at muster
      point (inside north wall, jittered), recruited+guard. Removes trader.
- [ ] `freeCaptive(x,z,seed,pal)`: spawns militia at cage, home=muster point, recruited+guard. Primary
      in-run heir source (camp clears). Townhouses (eco_district) also add townsfolk.

### 7.3 Succession — "The Blade Passes" (`successionStore`, `SuccessionDirector`)
- [ ] On hero death: `addGrave(x,y,z)`; find nearest standing villager; `startSoul` wisp flies for
      `SUCCESSION_DURATION=1.7 s`; heir takes the blade at its location with full HP, all progression
      intact. If no standing villager → run ends (`'bloodline'`).
- [ ] Graves persist (`getGraves`, `resetGraves` on new game). Soul = `{from*, to*, startAt}`.
- [ ] Dawn births: menu→prep spawns `STARTING_HEIRS=3` founders; wave→prep spawns 1 new townsperson
      at a rotating house-slot door (not recruited, not guard).

### 7.4 City layout (`cityPlan`, `cityStore`, `City`)
- [ ] `CityState`: housesBuilt 0–8, wallsBuilt, gateBuilt, towersBuilt, farmBuilt, keepArchers,
      villagerArmorTier 0–2, ballistaBuilt, shrineBuilt, taxOffice. Mutators notify UI.
- [ ] Keep slot base (72,54), footprint ±3.5×±3.0, interact dist 4.2 (E to open shop/tree).
- [ ] 8 house slots in two rows (north z48, south z60 at x 63/67/77/81 base), face center, footprint
      ±1.7×±1.4. Each house = 1 native townsperson + door (1.6 out front) + garden.
- [ ] 8 wall segments (thickness 0.6, height 1.35) + 4 gates (gap 4) centered per side + 4 corner
      towers (footprint ±1.0, height 2.5, destructible w/ HP bar + rubble). Farm slot base (64,54)
      5×4. Courtyard flagstone floor laid once walls built (inset 0.5).
- [ ] Structures register/clear AABB blockers per layer on mount/unmount.

### 7.5 Building models (port mesh-for-mesh)
- [ ] `House`: foundation+chimney, walls, roof (pitched), hinged door eased over 0.25 s matching
      owner's `doorOpenUntil`, flickering emissive window, chimney smoke sparkles.
- [ ] Keep (`cityModels`): multi-part stronghold, merlon LOD by HP ratio, banners, finial.
- [ ] `Garden`: instanced soil + 25 veggies + fence. `Village`/`Tent`/`Campfire`/`Grave` static props.

---

## 8. Day/Night, Biome Gathering, Items, Pickups & FX

### 8.1 Day/night clock (`timeStore`, `DayNight`, `SunShadow`)
- [ ] `DAY_LENGTH=120 s` full cycle. `t∈[0,1)`: 0 midnight, 0.5 noon. Boots frozen at t=0.3.
- [ ] Phase-driven: prep sweeps dawn `T_DAWN=0.30`→dusk `T_DUSK=0.70` as countdown; wave eases to
      night `NIGHT_T=0.0`; menu/victory/defeat ease to `DAY_T=0.30`. Ease `DAY_LERP_RATE=0.7`.
- [ ] `sampleDay()` outputs sun dir (azimuth `(t-0.25)*2π`, south bias 0.55), sun height,
      sunVis (0→1 smoothstep at horizon), nightAmount, sun color (#ff8a4d↔#ffe6b3), ambient
      (0.18↔0.82, #2c3a63↔#fff4e0), hemisphere + fog colors. Fog tints toward current biome by 0.45
      in daylight. Night audio gate when sun height < 0.05.

### 8.2 Biome gathering (`forageStore` factory: herbs, apples)
- [ ] Walk-up auto-gather (no swing). 90 s respawn; on take plant shrinks to `SPROUT_SCALE=0.14`,
      lerps back over ~5.5 s. Annulus placement (0.55r–0.95r) puts targets at biome rim.
- [ ] **Marsh Herb** (swamp, ~13 live of ~40): radius 0.85, gives `marsh_herb` (heal 30 + Resist
      0.6/12 s, quick=food). Float "+🌿 Marsh Herb" #aef0c4.
- [ ] **Forest Apple** (W forest, ~14 of ~26): radius 0.95, gives `apple` (heal 18). Float "+🍎 Apple".
- [ ] Both pickups play `playGold()`.

### 8.3 Items & inventory (`inventoryStore`)
- [ ] Bag `BAG_SIZE=24` + 1 weapon + 1 armor slot. Quick-slots are *derived views* (Q food, Z resist,
      X power, C haste). `I` opens modal (freezes world).
- [ ] Full `ITEM_DEFS` (id · name · kind · effect · quick · stack):

  | id | name | kind | heal | dmg | def | buff | quick | stack |
  |----|------|------|------|-----|-----|------|-------|-------|
  | bread | Bread | consumable | 15 | | | | food | ✓ |
  | potion | Health Potion | consumable | 40 | | | | food | ✓ |
  | feast | Tavern Feast | consumable | 100 | | | | food | ✓ |
  | apple | Forest Apple | consumable | 18 | | | | food | ✓ |
  | marsh_herb | Marsh Herb | consumable | 30 | | | Resist .6/12s | food | ✓ |
  | croc_steak | Croc Steak | consumable | 70 | | | | food | ✓ |
  | elk_jerky | Elk Jerky | consumable | 35 | | | | food | ✓ |
  | fur | Thick Fur | consumable | | | | Resist .6/12s | resist(Z) | ✓ |
  | venom | Venom Vial | consumable | | | | Power 1.4/12s | power(X) | ✓ |
  | goat_charm | Goat Charm | consumable | | | | Haste 1.3/12s | haste(C) | ✓ |
  | sword_iron | Iron Sword | weapon | | +11 | | | | ✗ |
  | sword_gold | Golden Blade | weapon | | +21 | | | | ✗ |
  | axe | Battle Axe | weapon | | +15 | | | | ✗ |
  | stone_maul | Stone Maul | weapon | | +18 | | | | ✗ |
  | blade_frost | Frostfang Greatsword | weapon | | +34 | | | | ✗ (rim) |
  | leather_armor | Leather Armor | armor | | | 11% | | | ✗ |
  | iron_armor | Iron Cuirass | armor | | | 20% | | | ✗ |
  | gold_armor | Gilded Plate | armor | | | 28% | | | ✗ |
  | dragon_plate | Dragonscale Plate | armor | | | 42% | | | ✗ (rim) |
  | mercenary_contract | Mercenary Contract | token | | | | | | ✓ |

- [ ] `addItem(id,n)`: stack-merge or place; bag full → fails (item lost, no toast) + fires pickup
      toast on success. `placeInBag` = silent (gear swaps don't toast). Armor multiplier =
      `1-defense`. Q `eatFood`, Z/X/C `activateBuff(kind)` use next matching bag item; click in panel
      to equip/unequip (swaps back to bag). Tokens inert except via `consumeItem`.

### 8.4 Shop & trader (`shopStore`, `shopCatalog`, `traderStore`, `Trader`)
- [ ] Castle shop (open at keep): bread 4, potion 12, feast 28, + axe 45 / golden 80 once unlocked.
      `discountedPrice = round(price × shopDiscount)` (0.8 with Merchant Guild). Buy fails if poor or
      bag full. SFX `playShopOpen`/`playMenuClick`.
- [ ] Trader Village (NE): wandering merchant NPCs (idle/wander/tend schedule), same catalog,
      recruitable via contract, prep-only, orks ignore them.

### 8.5 Pickups, chests, orbs
- [ ] **Ground loot** (`pickupStore`): `spawnPickup(id,x,y,z)`, pool 64, collect radius 0.9 (if bag
      room), spinning bob (spin 1.6, bob 0.08@2.5), per-item tints, `playGoldPickup`, float "+name".
- [ ] **Chests** (`Chest`, World CHESTS): interact radius 2.2, `F` to open, lid swings to -0.6π,
      `playChestOpen` + 'chest' voice; bag-full → stays shut, "Bag full!" toast. Two kinds:
      **treasure** (one-shot unique gear, gold 6–30) and **cache** (respawns after `CACHE_RESPAWN=150
      s`, gold + food). ~29 fixed chests; biome-tinted materials. (See item-FX spec for full loot
      table per coordinate.)
- [ ] **Reward orbs** (`orbStore`): `spawnOrbs(kind,x,y,z,count,total)`, pool 160, kinds gold/xp.
      Burst (ballistic, gravity -14, drag 3, soft bounce y0.25) until `seekAt≈0.1–0.2 s`, then home to
      `player+1` at speed `min(30, 7+dist*16)`, `SEEK_RESPONSE=16`, collect dist 0.85, life cap 1.1 s
      (force-grant). Gold/xp granted only on landing (accumulated, avoids SFX spam). Render octahedron,
      gold #ffe27a / xp #74ff8b, no-tonemap glow.

### 8.6 FX
- [ ] **Floating text** (`fxStore`/`FloatingText`): `spawnFloat(text,color,x,y,z,scale=1)`, 1.1 s life,
      ±0.4 horizontal drift, +1.3 rise, snap-in 0.16 s (0.6→1.15→1.0), quadratic fade. Colors: damage
      #ff9a9a (crit ×1.3), heal #9be88a (0.7), gold #ffd58c.
- [ ] **Screen shake** (`addShake`): trauma 0–1, shake `0.9*trauma²`, decay 2.4/s.
- [ ] **FOV punch** (`addFovKick`): kill 1.3 / hit 0.65 / land 1.1, max 7, decay 22/s.
- [ ] **Dust** (`dustStore`/`Dust`): `spawnDust`, pool 160, life 0.45+0.4, gravity -1.2, drag 3.4,
      no bloom, 5 motes default, biome colors (snow #eaf1f7 loose, desert #e3d2a0 loose, rock #bcb8b0
      loose, swamp #6f6a4e, grass #c9b893), grow-in then shrink-out.

---

## 9. HUD & UI Panels (`src/hud`)

- [ ] DOM layered over canvas; each panel subscribes to stores and re-renders only on notify.
      `isFrozen()` gates interaction. The user dislikes decorative chrome — build only what's listed.

  | Panel | Visibility | Freezes | Shows |
  |-------|-----------|---------|-------|
  | StartScreen | until phase≠menu | overlay | title, play, controls legend → `setPhase('prep')` |
  | PlayerHud | always | no | level badge, HP/XP bars, stamina bar (rAF-driven), hurt/level-up flash, death "The blade passes…" |
  | Objective | after menu | no | prep banner (Day N, sun timer, "Begin night ▶" skip), wave banner (Wave N/total, orks left), keep HP + ⚠ alert, "🛡 N heirs" (red at 0), victory/defeat screens |
  | QuickBar | always | no | gold + stone, 4 quick slots (Q/Z/X/C icons+counts) |
  | BuffBar | only when buffed | no | per-buff icon + shrinking duration bar (rAF) |
  | ItemToasts | only when toasts | no | pickup cards (icon+name×count+stat line+note), 4 s, click dismiss, max 5, merge |
  | ShopPanel | shop open | **yes** | gold, item list w/ discounted prices, buy |
  | UpgradeTree | tree open | **yes** | 4 branches, node states owned/locked/poor/buy, gold★+stone🪨 costs |
  | InventoryPanel | inv open | **yes** | equipped (weapon/armor) + bag grid, click use/equip/unequip |
  | PauseMenu | paused & started | modal | Resume, Audio, AI paths, Quality cycle |
  | AudioToggle / DebugToggle / DebugMoneyToggle | always | no | mute / F9 paths / F8 money |

---

## 10. Audio (`src/audio`)

### 10.1 Mix & infrastructure
- [ ] Live mix: sfx 0.5, voice 0.6, range 18 (creature-voice radius), music 0.22, ambient 0.32,
      narration 0.57. AudioContext suspended until first user gesture. Pause suspends context.
- [ ] SFX pooled (6 instances/url for polyphony), ±10% volume + ±15% pitch variance.
      Creature voices distance-scaled via `volForDist`.

### 10.2 Procedural / sampled SFX (synth fallback where noted)
- [ ] Combat: playSwing (whoosh), playHit (crack+thud), playPick (mine), playPlayerHit (clang),
      playKill (synth), playHurt (synth), playBlock (clang).
- [ ] UI/items: playGold (blips), playLevelUp (arpeggio), playVictory (triad), playConsume, playEquip,
      playChestOpen, playShopOpen, playMenuClick, playAbilityCast, playGoldPickup, playWaveStart.
- [ ] Creatures (sample-only, distance-scaled): playOrkGrunt/Roar, playBearRoar/Growl, playDogBark,
      playCatMeow, playVillagerGrunt.
- [ ] Hero grunts (rate-limited `GRUNT_MIN_GAP=1.6 s`, never while speaking): playPlayerAttack (34%),
      playPlayerHurtVoice, playPlayerJump, playPlayerDeath (1×, via narration node, interrupts).

### 10.3 Music/ambience (`SoundScape`) & combat detection (`combatStore`)
- [ ] Crossfaded loops via per-frame imperatives: menu theme (fades on Play, rate 1.3), forest
      ambient, day hymn, night/wave dread (nightMix ease 0.9), boss track (replaces dread on boss),
      day-combat layer (combatMix ease 1.6, ducks hymn), positional water (4× map edges).
- [ ] Combat detection: `ENGAGE_HITS=3` within `ENGAGE_WINDOW=3 s` confirms a fight; `DISENGAGE_AFTER=4 s`
      with no blow ends it. Triggered by hero↔ork blows only (bears/animals/mining excluded). Drives
      combat-music swell.

### 10.4 Hero narration (`voiceStore`)
- [ ] `sayHeroLine(key,url,opts)`: once-per-run (default), `GLOBAL_GAP=14 s` between any two lines,
      never while voice playing; rolls back reservation if clip missing. `stopVoice` fades ~180 ms on
      biome exit.
- [ ] Biome musings (debounced ~0.7 s presence, ~6 s entry timeout): `biome:grass` (home, only after
      `wildernessSpoken`), snow, desert, rock, swamp, forest. Event hints: first stone, night warning
      (~15 s before night), low HP (~30%), wave start. `resetHeroVoice` on new run. (All lyrics +
      file mapping live in `docs/voice-lines.md`.)

---

## 11. Debug & Dev Tooling (optional for port)
- [ ] `debugStore`: `showPaths` (F9, renders A* paths) + `unlimitedMoney` (F8, free spend).
- [ ] Dev hooks: `window.tp(x,z)` teleport, `window.ppos()`, `window.giveItem(id,n)`.
- [ ] `ShaderWarmup`/`warmupStore`: precompiles shaders behind StartScreen (three.js-specific; the
      Bevy port can drop this).
- [ ] Leva tuning panel (`DebugBindings`): fog/light/vision-shader uniforms — dev only.

---

## 12. Port Risk Notes
- [ ] **Determinism vs. randomness:** world gen must be exactly reproduced (pure math); runtime
      `Math.random()` (anim jitter, loot, spark velocity) need only be *plausibly* random.
- [ ] **Two-channel state discipline:** keep per-frame mutation off the event bus; only fire
      events/change-detection on discrete UI-relevant changes (HP cross, gold/xp, level, inventory).
- [ ] **Procedural skeletons:** all models are box/primitive trees animated by phase math — no
      skinned GLTFs. Reproduce via Bevy mesh hierarchies + transform systems, or author equivalents.
- [ ] **Vision/terrain shader** (`vision.ts`): per-fragment world-space mottle + large-scale hue/
      value variation + optional detail texture. Port as a custom Bevy material; cosmetic, not gating.
- [ ] **Coordinate offset group:** replicate the `-CENTER` translation (or bake it) to avoid
      float precision issues far from origin.
