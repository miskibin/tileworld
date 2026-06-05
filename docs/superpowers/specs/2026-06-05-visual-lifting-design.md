# Visual Lifting + Perf Optimizations + Living Day Clock — Design

**Date:** 2026-06-05
**Status:** Approved (design), pending spec review
**Goal:** Make the game look dramatically closer to the reference "AFTER" mockup —
fuller/varied trees, warmer golden light, brighter reflective water, atmospheric
distant haze, denser ground cover — at **max visual budget**, with everything heavy
gated behind quality tiers so weak GPUs still run. Fold in the previously-discussed
perf optimizations. Make the in-game day clock actually progress (today it is pinned
to 7.2h).

## Non-goals
- No real-time reflections (SSR / `Reflector`), no GI bake, no added full-screen
  post passes. Rejected in brainstorming (strategy C) — fights the measured 76%
  post-processing frame cost for poor ROI.
- No new asset pipeline. Everything stays procedural/deterministic at runtime.
- No gameplay/balance changes beyond the day clock's visual progression.

## Hard constraints (from project memory + CLAUDE.md)
- **Post-processing already ≈76% of frame cost.** Net new full-screen passes are
  banned; reuse the existing merged grade pass; prefer baked/GPU/vertex work.
- **Point-light count stutter:** NEVER add/remove point lights dynamically or hide
  a light's parent group — any change to the gathered `NUM_POINT_LIGHTS` recompiles
  every lit material. Tiers and all new visuals MUST NOT add/remove point lights.
  (Trees, water, grass, grade, fog use no point lights — safe. Verify nothing new
  introduces one.)
- **Deterministic world:** no `Math.random()` at gen time — use the existing hash
  helpers. Bakes must be reproducible.
- **Minimal HUD:** the tier control in the pause menu is a clean selector, no
  decorative chrome.
- `npm run build` (`tsc -b` + vite) is the correctness gate; `npm test` after any
  store/logic change. Models edited via the **model-smith** skill + `npm run inspect`.

## Tier model (extend `qualityStore`)
Current: 2 tiers (`'high' | 'low'`). Extend to **3**: `'low' | 'medium' | 'high'`.
- `setQuality`, `toggleQuality` (→ becomes a 3-way cycle), persistence, and
  `subscribeQuality` keep their shapes. `'high'` stays the default.
- Migrate stored `'low'`/`'high'` values cleanly; unknown → `'high'`.
- Every consumer that currently checks `q === 'high'` is re-audited against the
  gating matrix below.

### Gating matrix
| Feature | low | medium | high |
|---|---|---|---|
| Sun shadows (SunShadow) | off | on | on |
| EffectComposer (grade+bloom+SMAA) | off | on | on |
| GodRays pass (most expensive) | off | **off** | on |
| N8AO live pass | off | off | off* (see WS6) |
| Baked vertex AO | on | on | on |
| Water: fresnel + fake reflection + foam | base only | full | full |
| Dense short-grass blade layer | off | reduced | full |
| Fuller-tree extra canopy parts | base | full | full |
| Warm grade / tonemap (AgX) | on | on | on |

\*WS6 removes N8AO entirely once baked AO holds up; if it doesn't, N8AO returns as
**high-only**.

## Workstreams (implementation order)

### WS0 — Living day clock (sky-as-countdown)
**Problem:** `DayNight`'s useFrame eases `day.t` toward a phase target
(`'wave'`→`NIGHT_T=0.0`, else→`DAY_T=DAY_START_T=0.30`=7.2h) and never advances,
so daytime is frozen at golden hour. `advanceDay()` exists but is unused.

**Change:** during phase `'prep'`, the sun position tracks **how much prep time
remains** — the sky becomes a visible countdown to the night assault.
- Add `getPrepProgress(): number` (0→1) to `waveStore` (derive from the existing
  prep timer; `PREP_DURATION=150`). Returns 1 when prep is over / skipped.
- In `DayNight` useFrame, when `getPhase()==='prep'` and not frozen:
  `day.t = lerp(T_DAWN, T_DUSK, getPrepProgress())` where `T_DAWN≈0.27`,
  `T_DUSK≈0.48` (morning → late afternoon, sun stays above horizon; exact values
  tuned in-game so it never goes dark mid-prep).
- `'wave'` keeps the existing ease to `NIGHT_T`. `'menu'`/`'victory'`/`'defeat'`
  keep current behavior (golden start / snap to day).
- War-bell early skip → `getPrepProgress()` jumps toward 1 → sun is near dusk,
  which reads correctly as "night is coming now."

**Verify:** in-game, watch the sun rise→cross→lower across a prep phase; confirm it
hits dusk as the timer/bell ends, then night falls for the wave. SunShadow + fog +
sky all already read from `timeStore`, so they follow for free.
**Tests:** unit-test `getPrepProgress()` monotonicity + clamping in waveStore tests.

### WS1 — Color & light grade (warm golden hour)
- Renderer tonemap `ACESFilmic` → **`AgX`** in `App.tsx` (free; renderer output
  shader, not a pass). Tune `toneMappingExposure`. Evaluate `Neutral` as a fallback.
- Tune `sampleDay` palette (`timeStore`): richer golden `SUN_LOW/HIGH`, ambient/hemi
  curves for warmer key + cooler fill.
- In the **existing merged grade pass** (`World.tsx` HueSaturation +
  BrightnessContrast + Vignette): add a subtle split-tone (warm highlights / cool
  shadows) and small saturation/contrast bump. Implement via tuned existing effects
  or one small mergeable color effect — **no new full-screen pass**.
- Soften Bloom (`luminanceSmoothing`/`intensity`) for a dreamier glow.
**Verify:** screenshot before/after; confirm composer still builds one merged
EffectPass for the non-convolution effects.

### WS2 — Water
Rebuild the `Water` material (`Water.tsx`) on top of the existing vertex-shader
ripple:
- Brighter, clearer blue base.
- **Fresnel:** darker head-on, bright sky tint at grazing angle.
- **Fake reflection:** mix in sky/horizon color + a sharp **sun specular highlight**
  that tracks the day/night sun direction (shared uniform updated from `timeStore`).
- **Shoreline foam:** white stripe via `smoothstep` on world-Y at the waterline —
  the research-confirmed cheap trick (no depth-buffer / offscreen pass).
- Tier: `low` = current flat base; `medium/high` = full fresnel+reflection+foam.
**Verify:** in-game at multiple sun angles + at a lake/river shore; check the
specular tracks the moving sun (WS0).

### WS3 — Fuller, varied trees ("models nicer")
Rebuild tree foliage in `Scatter.tsx` PARTS using the **model-smith** skill:
- Replace stacked sharp cones with rounder, layered low-poly canopies; 2–3 distinct
  silhouettes.
- **Per-instance green-tone variation** (`instanceColor`) + slight per-instance
  scale/lean so a stand of trees doesn't look cloned.
- Keep instancing + merged parts + wind sway. Extra canopy parts gated to
  `medium/high`.
- Consider matching upgrades to birch/snowPine for consistency.
**Verify:** `npm run inspect <tree>` passes all FAIL/WARN checks (no floating/sunk
parts, base on y=0); then in-game forest readability.

### WS4 — Atmosphere / distant haze
- Brighten the far fog toward a **luminous horizon** (mockup's bright distant fade)
  instead of muddy tan; tune `fogColor`/density per time-of-day in `sampleDay` +
  `DayNight`. Possibly nudge the `Sky` dome params for a brighter horizon band.
- Keep the existing per-biome fog tint + easing.
**Verify:** in-game distant vista reads as bright haze, not a flat wall of fog.

### WS5 — More ground cover ("kobierzec")
- Increase scatter density in grass/forest biomes (`obstacles.ts` density table):
  tufts/flowers/mushrooms.
- New **pebble** scatter prop (small instanced rocks) in `Scatter.tsx`.
- New **dense short-grass-blade** instanced layer near the player — thin blade
  clusters (replace the 4-sided cone tuft look), distance-culled, tier-gated
  (`off`/`reduced`/`full`).
- Reuse the existing instancing + cull + wind systems; respect reserved footprints.
**Verify:** in-game density read near spawn; confirm `isCulled` still frees distant
instances and FPS holds within the chosen tier budget.

### WS6 — Bake AO → vertex colors, drop the N8AO live pass
- Compute **static ambient occlusion into vertex colors** at world-gen time for
  terrain + static scatter (deterministic, using existing hash helpers — e.g.
  darken vertices near taller neighbors / under canopies / in crevices). Apply via
  `vertexColors` so it's a free fragment read.
- Remove the live **N8AO** pass from the EffectComposer (reclaims a large slice of
  the 76%). Mobs/dynamic props get grounding from their existing real shadows.
- **A/B gate:** if the baked look doesn't hold, restore N8AO as **high-tier-only**
  rather than all-tier. `log`/document whichever path ships.
**Verify:** in-game compare grounded look with/without; measure frame cost via
`?perf` to confirm the reclaim.

### WS7 — Quality tiers + Pause-menu UI
- Extend `qualityStore` to 3 tiers (above). `G` key cycles low→medium→high.
- **Pause menu (`PauseMenu.tsx`):** add a quality control that shows the **current**
  tier and lets the player switch it (3 buttons or a cycling button:
  `Quality: Low/Medium/High`). Subscribes to `qualityStore` like the other toggles.
  Clean, no decorative chrome (minimal-HUD preference).
- Keep `localStorage` persistence. StartScreen controls list updated to mention the
  menu control.
**Verify:** open ESC menu, see current tier, switch it, confirm the gated features
turn on/off live and the choice persists across reload.

## Cross-cutting risks / watch-items
- **Material recompiles when toggling tiers** (shadows/post enable flags are part of
  compiled programs). Acceptable for a rare manual menu action — same as today's G
  key. Do NOT toggle anything that changes the point-light count.
- **Instancing + culling interplay** for the new grass layer: ensure per-instance or
  chunked culling so the dense layer doesn't defeat `isCulled`.
- **AO bake startup cost:** keep the bake cheap/deterministic; it runs once on the
  cached map. If it adds noticeable load time, chunk it or precompute into geometry.
- **AgX desaturation:** AgX slightly desaturates vs ACES — compensate in the grade
  (WS1). Evaluate `Neutral` if AgX reads too flat for the stylized look.

## Implementation order (each step verifiable in-game)
WS0 (clock) → WS1 (color/light) → WS4 (atmosphere) → WS2 (water) → WS3 (trees) →
WS5 (ground cover) → WS6 (AO bake / drop N8AO) → WS7 (tiers + menu).

Rationale: clock + color/light + atmosphere are the fastest perceived wins and
cheap; water + trees are the headline model upgrades; AO bake is the big perf
reclaim that pays for the density; tiers + menu land last to gate everything cleanly.
