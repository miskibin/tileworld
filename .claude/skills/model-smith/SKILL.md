---
name: model-smith
description: Build or edit a 3D model (building, character, creature, prop) in src/world/, then verify its structure headlessly. Use when creating or modifying any visual mesh component in this tileworld game — knights, orks, houses, tents, chests, towers, animals, scenery — to catch broken geometry (floating parts, sunk/floating models, misaligned pieces, NaN transforms) WITHOUT looking at the screen.
---

# Model Smith

Models in this project are **React components that compose three.js primitives** (`<boxGeometry>`, `<sphereGeometry>`, `<coneGeometry>`, `THREE.ExtrudeGeometry`, etc.) inside nested `<group>`s — see [House.tsx](../../../src/world/House.tsx), [Ork.tsx](../../../src/world/Ork.tsx), [Tent.tsx](../../../src/world/Tent.tsx). There are no GLTF files. You build geometry by hand, which means parts can drift, float, sink, or collapse and **you cannot see it**. So every model change ends with a headless inspection.

## Workflow (do every step)

1. **Build / edit** the model component following the conventions below.
2. **Register it** in [scripts/inspect-model.tsx](../../../scripts/inspect-model.tsx) — import the component and add one line to `REGISTRY` with inspection-friendly props (position `[0,0,0]`; placement is normalized away, so any position works):
   ```tsx
   Tower: () => <Tower position={[0, 0, 0]} />,
   ```
3. **Inspect**:
   ```bash
   npm run inspect <ModelName>
   ```
4. **Read the report and fix every issue**, then re-run until the checks pass. The report is the source of truth — do not declare the model done while a check fires unless you can justify it (see "Judging WARNs").

## Build conventions (match the existing code)

- **Build around the local origin.** The component returns one root `<group position={position} rotation={[0, rotation, 0]}>`; everything inside is authored relative to that group. The parent supplies grid-coord placement.
- **Base sits on `y = 0`.** A model's lowest structural point should be at (or just above) `y = 0` — that's the ground. Feet, foundations, and bases at `y ≈ 0`; build upward in `+y`. The inspector flags models that sink below or float above the ground.
- **Materials:** `useMemo(() => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true }), [deps])`. Share module-level materials/geometries for repeated parts (see Tent/Bridge). Hardcode palette colors as named consts at the top of the file.
- **Dimensions as named consts** (`const WALL_H = 1.4`) so parts line up and stay editable — see House.
- **Shadows:** `castShadow` / `receiveShadow` on solid meshes.
- **Animation** belongs in `useFrame`, gated on `if (isFrozen()) return` ([pauseStore](../../../src/world/pauseStore.ts)) for anything that should hold still while paused.
- Scale reference: 1 unit = 1 tile. A house is ~2.9 wide × 2.3 tall; the knight is ~0.6 tall; a cat ~0.5. Keep models in that ballpark.

## Reading the report

Per-mesh lines show geometry type, material color, and the world-space `y` range + `size` of each part. The header shows total mesh count, triangles, and whole-model bounds. Then `checks:`.

**FAIL** (exit code 1 — must fix):
- `non-finite world transform (NaN/Infinity)` — a position/rotation/scale computed to `NaN` (often divide-by-zero or `Math` on undefined). Find the bad expression.
- `empty / zero-vertex geometry` — a geometry with no vertices (e.g. an `ExtrudeGeometry` from an unclosed/empty `Shape`, or args that collapse it). Fix the shape/args.
- `No structural meshes found` / `rendered nothing` — the component returned nothing measurable.

**WARN** (needs your judgment, doesn't fail the run):
- `floats N units from the nearest other part` — a mesh whose bounding box is far from every other part. Usually a **detached limb / piece left at the wrong position**. Check the part's `position`. (Legitimately separate pieces — a thrown spear, a floating UI plane — are fine; confirm it's intentional.)
- `sinks N units below the ground plane` — lowest point is well under `y=0`. Often a misplaced part. Legit exceptions: bridge pilings, a held weapon dangling past the feet, roots — confirm before dismissing.
- `base floats N units above the ground` — the whole model hovers; usually the root parts need shifting down so the base hits `y≈0`.
- `huge` / `degenerate size` — total bounds are absurd; a geometry arg or scale is wrong.

### Judging WARNs

A WARN is "look at this," not "this is broken." After a change, compare the report to your intent: does each part's `y` range and `size` match what you meant to build? A roof that reports `y 1.6..2.3` sitting on walls that end at `1.6` is correct; a chimney reporting `y 0.2..0.9` when it should top the roof is a real bug. Use the per-part boxes to reason about whether pieces stack and touch as intended.

## Limitations

- **Models with a drei `<Text>` label cannot mount headless** (troika needs a real canvas) — e.g. Chest, Shop, the city buildings. `npm run inspect` reports a clean "Failed to mount" for them. To inspect such a model's structure, temporarily comment out its `<Text>`, add it to the registry, inspect, then restore the `<Text>`.
- **Mob aggregates** (`Mobs`, `Bears`, `VillagerCrowd`) render many entities from stores and aren't single models. Inspect the single-entity view component instead (e.g. `OrkView`, registered as `Ork`).
- Decorative drei `<Sparkles>`/`<Billboard>` and audio don't crash but contribute no structural meshes — `<Sparkles>` is `Points` (ignored), `<Text>` labels are skipped.

## How it works (if you need to extend it)

[scripts/inspect-model.tsx](../../../scripts/inspect-model.tsx) mounts the component with `@react-three/test-renderer` (real three.js object tree, no browser/WebGL), advances 2 frames so `useFrame`/`useEffect` settle, resets the root group to the origin, then traverses every `Mesh`, computes world-space `Box3` bounds per part (instanced meshes expand over all instances), and runs the checks. Thresholds (`DETACH_GAP`, `GROUND_SINK`, etc.) are consts near the top — tune them there if a class of model needs different tolerances.
