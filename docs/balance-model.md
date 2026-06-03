# Tileworld — Mathematical Balance Model

A first-principles model for tuning every combat/economy number in the game from a
small set of design knobs, instead of hand-authoring each table. It (1) measures the
current constants, (2) reconciles them with the play assumptions, (3) derives the
income, combat, and survival equations, (4) states the **balance invariants** the run
must satisfy, and (5) recommends a coherent, formula-driven value set.

All file:line references are to the code as of this writing; the formulas are written so
the hand-tuned tables (`WAVES`, the per-level stats, the upgrade costs) can be replaced
by a generator keyed on a few growth constants.

---

## 0. Play assumptions (the inputs you gave, made explicit)

| Symbol | Meaning | Value | Where to change |
|---|---|---|---|
| `camps/day` | ork camps fully cleared per day | **1** | design knob |
| `cases/day` | treasure chests opened per day | **5** | design knob |
| `s_p` | share of night orks the **player** kills | **0.80** | design knob |
| `p_block` | fraction of incoming frontal hits the player blocks | **0.50** | design knob |
| `g_h` | per-night ork-HP growth | **1.10** | `WAVES[].hpScale` |

These are the levers. Everything below is expressed as a function of them, so when you
change an assumption the recommended values move with it.

---

## 1. Measured baseline (current constants)

**Player** (`playerStore.ts`)
- `PLAYER_MAX_HP = 125`, `PLAYER_BASE_DAMAGE = 25`, `PLAYER_STARTING_GOLD = 30`
- `HP_PER_LEVEL = 20`, `DAMAGE_PER_LEVEL = 8`, `XP_PER_ORK = 20`
- XP curve: `xpToNext(L) = 50·L` ⇒ cumulative XP to reach level `L` is
  `Xcum(L) = 25·(L−1)·L`  (L2=50, L3=150, L4=300, L5=500, L8=1400, L10=2250).
- Swing: `ATTACK_DURATION = 0.45 s`, damage lands at phase 0.3, click-driven (no extra
  cooldown) ⇒ max melee cadence `τ_p ≈ 0.45 s`.

**Block** (`blockStore.ts`): `BLOCK_REDUCTION = 0.85` (frontal), cone `cos 72°`, stamina
empties in ~3.3 s of holding, regen 0.34/s. So holding the shield is a *duty-cycled*
85% reduction, not permanent.

**Armor** (`inventoryStore.ts`): damage-taken multiplier `1 − defense`:
leather 0.15 → ×0.85, iron 0.28 → ×0.72, gilded 0.40 → ×0.60. **Armor drops only from
chests** (see §3) — it is not buyable.

**Weapons**: iron sword +15 (chest), battle axe +22, stone maul +26 (chest), golden
blade +30. Axe & golden blade are shop items gated behind Arsenal upgrades.

**Orks** (`orkConfig.ts`) — base HP / melee dmg / `bountyGold` / `bountyXp`:

| variant | HP | dmg | swing cycle¹ | gold | xp |
|---|---|---|---|---|---|
| grunt | 254 | 24 | 1.6 s | 8 | 20 |
| scout | 136 | 15 | 1.0 s | 6 | 14 |
| berserker | 306 | 30 | 0.85 s | 14 | 30 |
| shaman | 201 | 26 (bolt) | 2.1 s | 18 | 34 |

¹ using `attackCooldown` as the inter-swing interval.

**Waves** (`waveStore.ts`): 7 assault nights + 1 boss. `hpScale` is exactly `1.10^(n−1)`
(1.10, 1.21, 1.33, 1.46, 1.61, 1.77, 1.95); count 9→26; `spawnInterval` 1.1→0.75 s; boss
= one berserker at ×14 HP = **4284 HP**.

**Defenders**: keep `CASTLE_MAX_HP = 650` (+350 reinforced = 1000); towers 7 dmg/1.6 s =
4.4 DPS (mastery 12/1.0 = 12 DPS) ×4; keep archers 6/1.7 = 3.5 DPS; ballista 45/2.6 =
17.3 DPS; villagers `VILLAGER_MAX_HP = 140`, 9 dmg/1.0 s = 9 DPS (armored 16 DPS).

**Day length**: `DAY_LENGTH = 120 s`; `PREP_DURATION = 120 s` between waves.

---

## 2. Structural reconciliation (read this first)

Your mental model ("a day": clear a camp + open 5 cases, then survive a night) assumes a
**renewable, multi-day loop**. The code is a **finite 8-night campaign** with **one-time**
resources:

- **3 camps total**, 4 orks each (grunt+scout+berserker+shaman), do **not** respawn.
  So "1 camp/day" is only true for the first ~3 days; after that camp income is 0.
- **24 chests total**, do **not** respawn. "5 cases/day" exhausts them in ~5 days.
- There are **8 nights**. So the renewable-economy framing and the finite map collide
  around day 3–5.

This matters because the **multiplicative power layer the player needs to survive late
nights (armor, top weapons) lives entirely in those one-time chests.** The model below
treats camps/chests as a *depleting front-loaded reserve*, which is the honest picture
and drives the main recommendation (§7): either make the map renewable, or guarantee a
deterministic gear floor so survival isn't chest-RNG.

---

## 3. Economy model

### 3.1 Income per source (one-time totals)

**Camps** (per camp = grunt+scout+berserker+shaman):
- gold = 8+6+14+18 = **46**, xp = 20+14+30+34 = **98**, HP to chew = 254+136+306+201 = **897**.
- 3 camps ⇒ **138 gold, 294 xp** total (one-time).

**Chests** (`World.tsx` `CHESTS`, 24 entries): gold sum = **275**; loot includes the only
sources of armor (leather ×1, iron ×2, gold ×2 chests) and the iron sword / stone maul.

**Nights** — player share `s_p = 0.8` of each wave's bounty. Per-wave totals (round-robin
composition × `hpScale`):

| night | work (Σ HP) | gold | xp | player gold (×0.8) | player xp (×0.8) |
|---|---|---|---|---|---|
| 1 | 2 369 | 80 | 188 | 64 | 150 |
| 2 | 2 606 | 80 | 188 | 64 | 150 |
| 3 | 3 579 | 138 | 294 | 110 | 235 |
| 4 | 4 945 | 166 | 358 | 133 | 286 |
| 5 | 6 489 | 204 | 436 | 163 | 349 |
| 6 | 8 721 | 250 | 534 | 200 | 427 |
| 7 | 11 484 | 308 | 652 | 246 | 522 |
| boss | 4 284 | 14 | 30 | 11 | 24 |
| **Σ** | **44 477** | **1 240** | **2 680** | **992** | **2 143** |

Tax Office stipend: `25 × 7` clears = 175 (if owned). Bounty upgrade scales night gold
×1.5 (gold only).

### 3.2 Total gold available vs. total upgrade cost — the binding constraint

```
G_total ≈ start 30 + camps 138 + chests 275 + nights 992 (+stipend 175 +bounty Δ≈500)
        ≈ 1 435  …  1 935 gold over a full clear.
```

Sum of **all** upgrade final costs (`upgradeStore.ts`, scaled ×1.6):
Economy 808 + Defense 1360 + Hero 864 + Arsenal 224 = **3 256 gold** (plus shop gear).

**The player can afford ≈ 45–60% of the tree.** Upgrade choice is therefore *binding*,
not flavor — the optimization in §6 is real. This is a healthy property; keep it.

### 3.3 XP → level pace

Cumulative player XP available = camps 294 + nights 2 143 ≈ **2 437** ⇒ end level ≈ **10–11**
(`Xcum(11)=2750`). But XP is **back-loaded**: 65% of night XP is in nights 5–7. Entering:

| entering night | cum xp (if camps cleared day 1) | level | base dmg `25+8(L−1)` |
|---|---|---|---|
| 1 | 294 | 4 | 49 |
| 3 | 594 | 5 | 57 |
| 5 | 1 064 | 7 | 73 |
| 7 | 1 892 | 9 | 89 |

So the hero is **L4 at the first assault and only L9 at the last** — innate damage roughly
*doubles* across the campaign while wave work grows **19×** (2 369 → 44 k cumulative, or
×1.32/night). Levels alone cannot keep pace; the gap must be filled multiplicatively. §5.

---

## 4. Combat throughput (DPS / time-to-kill / effective-HP)

### 4.1 Player offense

```
DPS_p = (D_base + 8·(L−1) + w) · (1 + c_crit) · M_cleave · η / τ_p
```
- `w` weapon bonus (0 / 15 / 22 / 26 / 30), `c_crit` crit chance (0 or 0.20),
- `M_cleave` ≈ 1 single-target, up to ~1.5–2 against packs (50% splash to neighbours),
- `η` melee uptime (aim + reposition) ≈ 0.7, `τ_p = 0.45 s`.

Worked: L4 + iron sword, no crit/cleave: `(49+15)·1·1·0.7/0.45 ≈ 100 DPS`.
L9 + golden blade + crit: `(89+30)·1.2·1·0.7/0.45 ≈ 222 DPS` (×1.5–2 vs packs with cleave).

### 4.2 Time to kill one ork

`TTK = H_ork(variant,n) / DPS_p`. Night-1 grunt (279 HP) at 100 DPS = 2.8 s; night-7
grunt (495 HP) at 222 DPS = 2.2 s. Boss 4284 / 222 ≈ 19 s (good boss feel).

### 4.3 Player effective-HP

```
eHP = maxHP / (a · b)
a = armor mult ∈ {1, .85, .72, .60}
b = block mult = 1 − p_block·BLOCK_REDUCTION = 1 − 0.5·0.85 = 0.575
```
L1 no armor: `125 / (1·0.575) = 217`. L8 (`maxHP=265`) + gold armor:
`265 / (0.60·0.575) = 768`. Lifesteal (+10/kill) and the Healing Shrine (4 HP/s inside
walls) add sustain `S`; effective survival time vs incoming `DPS_in` is
`(eHP)/(DPS_in − S)`.

### 4.4 Incoming pressure

A focused ork applies `dmg/τ_ork` DPS (grunt 24/1.6 = 15, berserker 30/0.85 = 35). If the
player tanks `k` orks at once, raw incoming = `k·15…35`, reduced by `a·b`. Night 7 with 3
berserkers on you: `3·35·0.345 ≈ 36 DPS` post-mitigation → eHP 768 lasts ~21 s, i.e.
survivable **only** with gold armor; with no armor (`b` only) eHP≈460 → ~10 s, a death.

---

## 5. The balance invariants

A night `n` is winnable iff **all three** hold. These are the equations to keep ≈1.1–1.3.

### I. Clear invariant (offense)
The defenders must out-damage the wave's total HP within the night:
```
( DPS_p(n) + DPS_town(n) ) · T_night(n)  ≥  W(n)
```
where `W(n)` is wave work (§3.1) and `T_night` is the night's length (spawn window +
mop-up). Player carries `s_p = 0.8`, so the *player* clause is `DPS_p · T ≥ 0.8·W`.

### II. Stability invariant (no death-spiral)
Kill-rate must exceed spawn-rate so concurrent orks (and thus keep leakage) stay bounded:
```
( DPS_p + DPS_town ) / H̄_ork(n)  ≥  1 / spawnInterval(n)
```
Night 7: `H̄ = 11484/26 = 442`, spawn rate `1/0.75 = 1.33/s` ⇒ need **≥ 588 DPS** total.
Estimated available ≈ 222 (player) + ~210 (4 mastery towers 48 + ballista 17 + archers
14 + ~8 armored villagers 128) ≈ **432 DPS < 588** → night 7 *intentionally* spills onto
the keep/walls. That's fine **iff** invariant III holds.

### III. Keep invariant (fail-safe HP)
Leaked orks × their DPS × leak-time must stay under keep HP:
```
keep_HP(1000 reinforced)  ≥  Σ leaked_orks · dmg · t_at_wall
```
With ~432/588 of spawn killed in the field, ~26% leaks; the reinforced keep + palisade +
militia must absorb it. This is why **Reinforced Keep + Walls are near-mandatory by
night 6–7**, and the model says so quantitatively.

### Decomposed power-vs-threat
Define hero **threat ratio** `ρ(n) = DPS_p(n) / (0.8·W(n)/T_night(n))`. Design target:
`ρ(n) ≥ 1.15` every night. Because `W(n)` grows ×1.32/night and innate damage grows
sub-linearly, `ρ` *decays* unless the multiplicative layer (weapon, crit, cleave) steps
up on schedule — which is the whole point of §6.

---

## 6. Optimal upgrade path & gear probability

### 6.1 Upgrades as (cost, Δpower) vectors

Rank by **efficiency** = power gained per gold, in the currency that the binding
invariant needs that night (offense early, then eHP, then town DPS for leak control).

Highest offense-DPS efficiency (Hero branch), Δ as a multiplier on `DPS_p`:

| upgrade | cost | effect | ΔDPS factor | gold / +10% DPS |
|---|---|---|---|---|
| Sharpened Blade | 48 | +5 dmg | ~+8% @L5 | ~60 |
| Honed Edge | 112 | +10 dmg | ~+13% | ~86 |
| Crit Strike | 128 | ×1.20 | +20% | 64 |
| Cleave | 176 | ×~1.5 vs packs | +50%* | 35* |
| Swift Boots | 96 | ×1.18 move (uptime↑) | ~+10% η | ~96 |

\*vs grouped orks — by far the best gold/DPS once waves are dense (night 4+).

Survivability efficiency (eHP per gold):

| upgrade | cost | Δ eHP factor |
|---|---|---|
| Vigor +25 HP | 48 | ×1.20 |
| Greater Vigor +50 | 112 | ×1.40 |
| (gold armor, **chest**) | 0 (RNG) | ×1.67 |
| Healing Shrine | 152 | +4 HP/s sustain |
| Reinforced Keep | 208 | keep ×1.54 (invariant III) |

### 6.2 Greedy optimal order (given the §0 assumptions)

Spend to keep the *binding* invariant ≥1.15 each night, cheapest-first within that:

1. **Day 1–2 (offense floor):** Sharpened Blade (48) → Vigor (48). Route the central
   **iron sword** chest. Target ρ(1)≥1.15.
2. **Day 2–3 (eHP + economy):** Bounty (96, pays for itself if bought before night 3)
   → route a **leather/iron armor** chest.
3. **Day 3–4 (pack damage):** Honed Edge (112) → **Cleave (176)** — the single biggest
   ρ lift once counts hit 12–18.
4. **Day 4–5 (leak control):** Palisade (80) → Watchtowers (128) → Tower Mastery (192).
5. **Day 5–6 (keep fail-safe):** Reinforced Keep (208) → Crit (128) → route **gold armor**.
6. **Day 6–7:** Greater Vigor (112) → Ballista (176) / Keep Archers (160) as gold allows.

This spends ≈ 1 700–1 900 gold — i.e. essentially the whole budget — and is the path the
income in §3.2 actually funds. Everything else (Healing Shrine, full Economy tier-4,
Golden Blade) is a luxury the budget can't reach without skipping a survival pillar.

### 6.3 Probability of holding gear by day `k` (chest-RNG)

Armor/weapons are gated on chests. If the player opens chests **randomly** (no routing),
with `cases/day = 5` and pool `M = 24`, an item living in `a` chests is held by day `k`
(opened `5k` chests) with the hypergeometric probability:
```
P_have(k) = 1 − C(M−a, 5k) / C(M, 5k)
```
Gold armor (`a = 2`):

| day | chests opened | P(have gold armor) | P(have ≥iron armor, a=4) |
|---|---|---|---|
| 1 | 5 | 0.38 | 0.65 |
| 2 | 10 | 0.67 | 0.93 |
| 3 | 15 | 0.86 | 0.99 |
| 4 | 20 | 0.97 | ~1.0 |

So under *random* looting the player is a coin-flip for gold armor entering night 1–2 —
exactly when §4.4 says no-armor death is likely. **Deliberate routing** collapses this to
P≈1 by the day the player chooses, which is why the recommendation is to make the *floor*
(leather) deterministic and let chests supply the *upgrades*. Fold the expected armor
mult into the survival model as `ā(k) = Σ P_tier(k)·a_tier` if you want a smooth curve.

---

## 7. Recommended value system (formula-driven)

Keep the current geometric skeleton (it's sound) and expose it as generators. `n = 1…7`
assault nights, `boss = 8`.

### 7.1 Wave generator (replaces the hand `WAVES` table)
```
hpScale(n)       = g_h^(n−1)            , g_h = 1.10          (unchanged — keep)
count(n)         = round(C0 · g_c^(n−1)), C0 = 9, g_c = 1.20  (≈ current)
spawnInterval(n) = clamp(1.15 − 0.06·n, 0.70, 1.15)          (≈ current)
boss_HP          = berserker_HP · 14                          (keep)
```
Threat work `W(n) = count(n)·H̄·g_h^(n−1)` then grows ×1.32/night by construction —
**this is the number every player-side curve must track.**

### 7.2 Player growth — make it *keep pace*
Innate-linear damage decays vs ×1.32 threat (§3.3). Two coupled fixes:

- **Front-load XP** so the hero isn't L4 at first contact. Recommend
  `xpToNext(L) = 40·L` (was 50·L) **or** raise early `bountyXp` ~25%. Target entry levels
  ≈ {1:5, 3:6, 5:8, 7:10}. This lifts early `DPS_p` ~15% where ρ is thinnest.
- **HP per level** to `25` (from 20) so `eHP` tracks the ×1.32 incoming-pressure growth:
  `maxHP(L) = 125 + 25·(L−1)`.
- Keep `DAMAGE_PER_LEVEL = 8`; the *multiplicative* layer (crit, cleave, weapons) is the
  designed pace-keeper — don't try to make linear levels carry it.

### 7.3 Deterministic gear floor (kills the RNG-death problem)
- Add **Leather Armor to the shop** at ~30 gold (deterministic ×0.85 floor). Keep
  iron/gold armor as chest rewards (the *upgrades*). This sets a survivability floor
  independent of chest luck while preserving exploration value.
- Keep weapons as-is; the iron sword central chest is effectively guaranteed (day-1 route).

### 7.4 Ork & villager values
- **Ork HP**: keep `g_h = 1.10`/night. Per-variant base HP unchanged — the variant
  *mix* (more berserkers/shamans late) already raises difficulty beyond raw scale.
- **Villager HP**: `140` is fragile vs late berserkers (eHP ≈ 140/0.72 armored ≈ 194 → ~6
  hits). Recommend scaling militia HP with the defense tier:
  `villager_HP = 140 · (1 + 0.25·armorTier)` so Town-Guard/Plated buys survivability, not
  just damage — this directly improves invariant II's `DPS_town` (dead villagers deal 0).
- **Keep HP**: 650 base / 1000 reinforced is correctly load-bearing for invariant III;
  keep, and keep Reinforced Keep on the critical path (§6.2).

### 7.5 Economy sizing
Total income (≈1 600–1 900) vs tree (3 256) gives ~55% reachability — a good tension.
If you make the map **renewable** (camps/chests respawn each prep, per your day-loop
framing), income becomes `≈ (46·camps/day + 55·cases/day + night)` per day; to preserve
the 55% reachability you'd then **raise upgrade costs** or cap respawns. Pick one:

- **Finite campaign (current):** keep numbers; just add the gear floor (§7.3) and XP
  front-load (§7.2).
- **Renewable day-loop (your framing):** respawn 1 camp + 5 chests/prep, and re-derive
  costs from `G_total(N nights) ≈ 0.55 · Σ desired upgrades`, raising `UPGRADE_COST_SCALE`
  until reachability ≈ 55% again.

---

## 8. One-screen summary

- Threat grows **geometrically ×1.32/night**; innate hero stats grow **linearly** ⇒ the
  **gap is closed by the multiplicative layer** (weapons, crit, cleave, town DPS, keep).
  Balance = keeping that layer's acquisition *on schedule*.
- Three invariants must each stay ≥1.15: **Clear** (out-DPS wave work), **Stability**
  (kill-rate > spawn-rate, else leak-spiral), **Keep** (HP absorbs the designed leak).
- The map's power-ups (armor, top weapons) are **one-time chest RNG**; under random
  looting the player is ~38% to have gold armor when first needed → add a **deterministic
  leather floor** and **front-load XP**.
- The gold budget funds ~55% of the upgrade tree, so the **greedy path in §6.2 is the
  real game** — Sharpen→Vigor→Bounty→Cleave→Walls/Towers→Reinforced Keep.

*Knobs to tune the whole system: `g_h` (ork HP growth), `g_c` (count growth), `s_p`
(player kill share), `p_block`, the XP slope, `HP_PER_LEVEL`, and `UPGRADE_COST_SCALE`.*
