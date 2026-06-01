# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server with HMR
npm run build    # tsc -b (typecheck all 3 tsconfigs) then vite build
npm run lint     # eslint . (flat config, type-checked rules off)
npm run preview  # serve the production build
npm run inspect <ModelName>  # headlessly dump one model's structure + run breakage checks
```

There is no test runner — the project has no tests. "Verify" means running `npm run dev` and observing the game in the browser.

`npm run build` is the real correctness gate: it runs the TypeScript project build (`tsc -b`) across `tsconfig.app.json` (src) and `tsconfig.node.json` (vite config) before bundling. Run it after non-trivial changes.

## What this is

A single-player 3D action-RPG that runs entirely in the browser — no backend, no assets pipeline beyond a few audio files. Stack: **React 19 + @react-three/fiber (R3F) + three.js + TypeScript + Vite**. The map, props, mobs, and most sound effects are generated procedurally and deterministically at runtime.

Render tree: `main.tsx` → `App.tsx` (the R3F `<Canvas>` + the DOM `<Hud/>`) → `World.tsx` (the whole 3D scene). The HUD is plain React DOM layered over the canvas, not part of the three.js scene.

## State management — the central pattern

**There is no state library (no Zustand, no Redux, no Context).** Every `src/world/*Store.ts` is a hand-rolled module-level external store. This is the single most important convention in the codebase; match it exactly when adding state.

Shape (see [playerStore.ts](src/world/playerStore.ts) as the canonical example):

- A module-level mutable `state` object (or array) holds the live data.
- `Set<Listener>` per concern + a `notifyX()` that fans out to subscribers.
- Getters return the **live reference** (e.g. `getPlayer()` returns the mutable object — callers read fields off it every frame).
- Mutators change `state` in place, then call `notifyX()`.
- `subscribeX(fn)` adds the listener, **immediately calls it once** with current state, and returns an unsubscribe fn. HUD components wire these in `useEffect(() => subscribeX(setLocalState), [])`.

The critical split between the two update channels:

- **Per-frame, hot path** (movement, AI, animation): R3F `useFrame` callbacks **mutate store state directly and read it directly** — they do **not** call `notify` and do **not** trigger React re-renders. Position, ork HP during a fight, etc. flow this way to keep frame cost near zero.
- **Discrete, UI-relevant changes** (HP crossing, gold/XP gain, level-up, inventory, shop open): mutators call `notify`, which re-renders subscribed HUD panels. Notify on events, never per frame.

When you add state, decide which channel it belongs to. If it changes every frame and only the 3D scene reads it, skip the subscription entirely.

## Editing 3D models

Models are hand-built React + three.js mesh trees (e.g. [House.tsx](src/world/House.tsx), [Ork.tsx](src/world/Ork.tsx)), so parts can silently float, sink, or misalign — and you can't see it. **When creating or editing any visual model, use the `model-smith` skill** and finish by registering the model in [scripts/inspect-model.tsx](scripts/inspect-model.tsx) and running `npm run inspect <Name>`. It mounts the single model headlessly (`@react-three/test-renderer`, no browser), prints per-part world bounding boxes + whole-model bounds, and runs FAIL/WARN checks (NaN transforms, empty geometry, detached/floating parts, base not on `y=0`, absurd size). Fix every flag before declaring the model done. Models with a drei `<Text>` label can't mount headless — the skill explains the workaround.

## Coordinate system

Everything game-logic-side works in **grid coordinates**: a `COLS=96 × ROWS=72` tile map ([tileMap.ts](src/world/tileMap.ts)). `CENTER_X=48`, `CENTER_Z=36`. Tile `(x,z)` has its center at world `(x+0.5, z+0.5)`.

`World.tsx` wraps the scene in one `<group position={[-CENTER_X, 0, -CENTER_Z]}>` so the map's center sits at the world origin. **Most entities are placed in grid coords inside that group** and the single offset does the centering — so pathfinding, placement, and collision all stay in grid space and never deal with the world offset. A few things (Birds, Sparkles, post-processing, camera, audio) live *outside* the group in world space.

The map itself is procedural and deterministic (no seed input, no external noise lib — just `Math.sin`/`cos` mixes): elliptical island with noisy coast, two carved rivers, inland lakes, and 6 biome blobs (snow NW / desert NE / swamp SW / pine SE / forest W / rock highlands E) with a grass interior for the castle. Tiles are built once and cached. `tileAt(x,z)` returns `Tile | null` (null = water/out of bounds); a tile's `height ≥ 2` is treated as an impassable cliff by pathfinding.

## Navigation stack

Mobs and villagers navigate by A* over the tile grid:

- [pathfinding.ts](src/world/pathfinding.ts) — 8-directional A*, returns waypoints at tile centers. `isWalkable()` is the chokepoint that consults all the blockers below; the climb feasibility of each step is the shared `canStep()` from tileMap (≤ 1 height-class change), so A* routes around Δ ≥ 2 cliff faces but follows climbable slopes up the mountains.
- [obstacles.ts](src/world/obstacles.ts) — procedural trees/rocks/bushes with collision radii; precomputes a `blockedTiles` set. Reserves footprints (camps, villages, castle, bridge approaches) so scatter doesn't spawn there.
- [roads.ts](src/world/roads.ts) / [bridges.ts](src/world/bridges.ts) — hand-authored road polylines from the 4 castle gates; water crossings emit bridges. Bridges make otherwise-water tiles walkable (`bridgeAt`).
- [houseBlockers.ts](src/world/houseBlockers.ts) — AABB footprints registered by House/City components on mount, cleared on unmount (scoped per owner so unmounting one structure doesn't wipe others).
- [vision.ts](src/world/vision.ts) — fog-of-war shader injection into MeshStandardMaterial; wired but currently disabled (`maxDarken` 0), tunable via the leva panel.
- [cull.ts](src/world/cull.ts) — `isCulled(x,z)` is true beyond ~46 tiles from the player. Entity `useFrame`s call it to skip AI/animation and hide meshes; this is the main perf lever on a dense map.

## Game loop & combat

No central loop — each entity component owns a `useFrame`. The shared contract:

1. **Freeze gate first.** Nearly every `useFrame` starts with `if (isFrozen()) return` ([pauseStore.ts](src/world/pauseStore.ts)). `isFrozen()` is true when hard-paused **or** a modal (shop / upgrade tree) is open, so the world holds still behind any panel. The world boots paused behind the StartScreen.
2. Read player state via `getPlayer()`, run AI (aggro/path/attack), mutate own refs/store directly.

Combat is store-mediated, no collision events: the player's swing in [Character.tsx](src/world/Character.tsx) calls `damageOrk()` ([orkStore.ts](src/world/orkStore.ts)); on kill it calls `addXp()`/`addGold()` on playerStore (which notify → HUD updates). Orks call the `damagePlayer` callback. Damage/level numbers float up via [fxStore.ts](src/world/fxStore.ts) + [FloatingText.tsx](src/world/FloatingText.tsx); screen shake via `addShake`.

Input: WASD/arrows + space/shift in [useKeyboard.ts](src/world/useKeyboard.ts) (returns a ref, read in `useFrame`); number keys + right-click hotbar in [HotbarInput.tsx](src/world/HotbarInput.tsx); mouse-look in [MouseLookCamera.tsx](src/world/MouseLookCamera.tsx).

## HUD

[Hud.tsx](src/hud/Hud.tsx) mounts all DOM panels; each subscribes to the relevant store and re-renders only on `notify`. Panels: StartScreen, PlayerHud (HP/XP — drives flashes via `requestAnimationFrame`, not React state, to avoid re-render churn), Objective (orks killed), Inventory (5-slot hotbar), ShopPanel, UpgradeTree, PauseMenu, and three toggles (audio, debug paths, debug money). Styling is one file: [hud.css](src/hud/hud.css). HUD ↔ world communication is **only** through stores — no props, no context, no direct three.js queries.

The user dislikes placeholder/decorative UI chrome — build only HUD that's asked for, default to less.

## Audio

[sfx.ts](src/audio/sfx.ts) synthesizes all gameplay SFX procedurally via the Web Audio API (no files) — `playHit`, `playKill`, `playGold`, `playLevelUp`, etc., called straight from store mutators. [audio.ts](src/audio/audio.ts) handles file-based loops/voice (the `public/audio/*.mp3` ambience) and the listener. Spatial loops use R3F `<PositionalAudio>` placed in `World.tsx`, gated on `useAudioEnabled()`.

## Debug

`leva` provides a live tuning panel ([DebugBindings.tsx](src/world/DebugBindings.tsx)): fog color/density, light intensities (pushed up to `World` state since light JSX props can't be mutated externally), and the vision shader uniforms. [debugStore.ts](src/world/debugStore.ts) holds two cheats: `showPaths` (renders A* paths via [DebugPaths.tsx](src/world/DebugPaths.tsx)) and `unlimitedMoney` (makes `spendGold` always succeed without deducting). `r3f-perf`'s `<Perf>` shows FPS/draw calls top-left. `main.tsx` overrides `document.hidden` in dev so the rAF loop keeps running in backgrounded/preview windows.

**Headless screenshots.** The built-in preview/MCP `screenshot` tool **cannot** capture this scene — its headless Chrome has no GPU and can't composite a WebGL surface for `Page.captureScreenshot`, so it hangs to the 30s timeout (verified: still times out with post-processing off, the R3F loop stopped, and all `requestAnimationFrame` neutered — it is not a frame-cost problem). `eval`/`console`/`network` preview tools work fine; only `screenshot` is affected. To get a screenshot, run **`npm run shot`** ([scripts/screenshot.mjs](scripts/screenshot.mjs)) with the dev server up — it launches its own Playwright chromium with a working SwiftShader backend and writes a PNG. It loads **capture mode** (`?capture`, [renderMode.ts](src/world/renderMode.ts)) by default: that drops the EffectComposer stack + shadows and pins `dpr` to 1, so a software-rendered frame paints in a few seconds instead of ~16s.
