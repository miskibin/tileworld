/**
 * Headless model inspector.
 *
 *   npm run inspect <ModelName>
 *
 * Mounts ONE model component in @react-three/test-renderer (the real three.js
 * object tree, no browser / no WebGL), normalizes its root to the origin, and
 * reports the structure as data so a model can be checked for breakage WITHOUT
 * looking at it: per-mesh world bounding boxes, the whole-model bounds, and a
 * set of automated FAIL/WARN checks (NaN transforms, empty geometry, parts that
 * float away from the rest, base not sitting on the ground, absurd size).
 *
 * Exit code is non-zero if any check FAILs, so it doubles as a gate.
 *
 * Add a model by importing it and adding one line to REGISTRY below.
 */
import React from 'react'
import * as THREE from 'three'
import ReactThreeTestRenderer from '@react-three/test-renderer'

import { House } from '../src/world/House'
import { Tent } from '../src/world/Tent'
import { Garden } from '../src/world/Garden'
import { Bridge } from '../src/world/Bridge'
import { Cat } from '../src/world/Cat'
import { Campfire } from '../src/world/Campfire'
import { OrkCamp } from '../src/world/OrkCamp'
import { Archer } from '../src/world/KeepArchers'
import { OrkView } from '../src/world/Ork'
import { createOrk } from '../src/world/orkStore'
import { Character } from '../src/world/Character'
import { Wall, Tower, Gate, Keep } from '../src/world/cityModels'
import { VillagerView } from '../src/world/Villager'
import { createVillager } from '../src/world/villagerStore'
import { Boat } from '../src/world/Boat'
import { Grave } from '../src/world/Grave'
import { DistantMountains } from '../src/world/DistantMountains'
import { WolfView } from '../src/world/Wolf'
import { ElkView } from '../src/world/Elk'
import { ScorpionView } from '../src/world/Scorpion'
import { DeerView } from '../src/world/Deer'
import { BoarView } from '../src/world/Boar'
import { RabbitView } from '../src/world/Rabbit'
import { PolarBearView } from '../src/world/PolarBear'
import { BogCrocView } from '../src/world/BogCroc'
import { GoatView } from '../src/world/Goat'
import { GolemView } from '../src/world/Golem'
import { createAnimal } from '../src/world/animalStore'

// ---------------------------------------------------------------------------
// Registry: name -> a thunk that builds the element with inspection-friendly
// props. Position/rotation are irrelevant — the root is normalized to the
// origin before measuring, so placement (even self-relocating models like
// Chest) does not affect the structural report. Build models around their
// own local origin with the base at y≈0 and this stays meaningful.
// ---------------------------------------------------------------------------
const REGISTRY: Record<string, () => React.ReactElement> = {
  House: () => <House position={[0, 0, 0]} />,
  Tent: () => <Tent position={[0, 0, 0]} />,
  Garden: () => <Garden position={[0, 0, 0]} />,
  Bridge: () => <Bridge from={[0, 0]} to={[4, 0]} y={0} />,
  Cat: () => <Cat home={[0, 0, 0]} />,
  Campfire: () => <Campfire position={[0, 0, 0]} />,
  OrkCamp: () => <OrkCamp position={[0, 0, 0]} />,
  Ork: () => <OrkView state={createOrk(0, 0, 0, 'grunt', 'red', 1)} />,
  OrkShaman: () => <OrkView state={createOrk(0, 0, 0, 'shaman', 'blue', 1)} />,
  Wolf: () => <WolfView state={createAnimal('wolf', 0, 0, 1)} />,
  Elk: () => <ElkView state={createAnimal('elk', 0, 0, 1)} />,
  Scorpion: () => <ScorpionView state={createAnimal('scorpion', 0, 0, 1)} />,
  PolarBear: () => <PolarBearView state={createAnimal('polar_bear', 0, 0, 1)} />,
  Deer: () => <DeerView state={createAnimal('deer', 0, 0, 1)} />,
  Boar: () => <BoarView state={createAnimal('boar', 0, 0, 1)} />,
  Rabbit: () => <RabbitView state={createAnimal('rabbit', 0, 0, 1)} />,
  BogCroc: () => <BogCrocView state={createAnimal('bog_croc', 0, 0, 1)} />,
  Goat: () => <GoatView state={createAnimal('goat', 0, 0, 1)} />,
  Golem: () => <GolemView state={createAnimal('golem', 0, 0, 1)} />,
  Wall: () => <Wall position={[0, 0, 0]} len={11} />,
  Tower: () => <Tower position={[0, 0, 0]} />,
  Archer: () => <Archer x={0} z={0} />,
  Gate: () => <Gate position={[0, 0, 0]} width={4} />,
  Keep: () => <Keep position={[0, 0, 0]} />,
  Boat: () => <Boat />,
  Grave: () => <Grave position={[0, 0, 0]} />,
  DistantMountains: () => <DistantMountains />,
  Villager: () => (
    <VillagerView
      state={createVillager({
        x: 0, y: 0, z: 0, facing: 0,
        homeX: 0, homeZ: 0, gardenX: 1, gardenZ: 0, doorX: 0, doorZ: 1,
        seed: 1, paletteIndex: 0,
      })}
    />
  ),
  Character: () => (
    <Character initial={[0, 0, 0]} posRef={{ current: { x: 0, y: 1, z: 0, moving: false } }} />
  ),
}

// NOTE: components that render a drei <Text> label (e.g. Chest, Shop, the city
// buildings) cannot mount headless — troika-three-text needs a real canvas. The
// inspector reports a clean "Failed to mount" for those. To inspect such a
// model's structure, temporarily comment out its <Text> and add it here.

// ---------------------------------------------------------------------------
// Check thresholds (world/grid units — 1 unit = 1 tile).
// ---------------------------------------------------------------------------
const DETACH_GAP = 0.6 // a mesh further than this from every other mesh = floating
const GROUND_SINK = 0.1 // model bottom below -this = sunk into the ground
const GROUND_FLOAT = 0.3 // model bottom above this = floating above the ground
const MAX_DIM = 40 // any model dimension above this = almost certainly wrong
const MIN_DIM = 0.05 // whole model smaller than this = degenerate

// Minimal DOM-ish shims so components that attach listeners (useKeyboard etc.)
// don't blow up under Node. test-renderer mocks the canvas/GL itself.
function installShims(): void {
  const g = globalThis as Record<string, unknown>
  const noop = () => {}
  // troika-three-text (drei <Text>) probes `self` for its web-worker pool.
  if (typeof g.self === 'undefined') g.self = globalThis
  if (typeof g.window === 'undefined') {
    g.window = { addEventListener: noop, removeEventListener: noop, devicePixelRatio: 1 }
  }
  if (typeof g.document === 'undefined') {
    g.document = { addEventListener: noop, removeEventListener: noop }
  }
  if (typeof g.requestAnimationFrame === 'undefined') {
    g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(0), 0) as unknown
    g.cancelAnimationFrame = noop
  }
  if (typeof g.ResizeObserver === 'undefined') {
    g.ResizeObserver = class {
      observe = noop
      unobserve = noop
      disconnect = noop
    }
  }
}

interface Vec3 {
  x: number
  y: number
  z: number
}
interface BoxReport {
  min: Vec3
  max: Vec3
  size: Vec3
  center: Vec3
}
interface MeshReport {
  name: string
  geometry: string
  instances?: number
  vertices: number
  triangles: number
  material: string
  box: BoxReport | null // null = empty geometry
}
interface Finding {
  level: 'FAIL' | 'WARN'
  msg: string
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
function v3(v: THREE.Vector3): Vec3 {
  return { x: round(v.x), y: round(v.y), z: round(v.z) }
}
function boxReport(b: THREE.Box3): BoxReport {
  const size = b.getSize(new THREE.Vector3())
  const center = b.getCenter(new THREE.Vector3())
  return { min: v3(b.min), max: v3(b.max), size: v3(size), center: v3(center) }
}
function finite(...ns: number[]): boolean {
  return ns.every((n) => Number.isFinite(n))
}

/** True for a troika drei <Text> object — a text label, not structural geometry. */
function isTextLabel(o: THREE.Object3D): boolean {
  const any = o as unknown as { isTroikaText?: boolean }
  return any.isTroikaText === true || o.constructor?.name === 'Text'
}

/** Axis-wise gap between two AABBs (0 if they touch or overlap). */
function boxGap(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x)
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y)
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z)
  return Math.hypot(dx, dy, dz)
}

async function main(): Promise<void> {
  installShims()

  const name = process.argv[2]
  const names = Object.keys(REGISTRY).sort()
  if (!name || !REGISTRY[name]) {
    if (name) console.error(`Unknown model: "${name}"`)
    console.error(`Usage: npm run inspect <ModelName>\nAvailable: ${names.join(', ')}`)
    process.exit(2)
  }

  let renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
  try {
    renderer = await ReactThreeTestRenderer.create(REGISTRY[name]())
  } catch (err) {
    console.error(`Failed to mount <${name}>: ${(err as Error).message}`)
    console.error('This component may touch APIs unavailable headless. See the model-smith skill.')
    process.exit(3)
  }

  // Let useEffect/useFrame settle (limb poses, store-driven placement, etc.).
  try {
    await renderer.advanceFrames(2, 1 / 60)
  } catch {
    // A useFrame that reads uninitialized state can throw; structure is still
    // measurable from the mounted tree.
  }

  const scene = renderer.scene.instance as THREE.Scene
  const roots = scene.children.filter((c) => !(c as THREE.Camera).isCamera)

  // Normalize: drop the root's placement (position + rotation) so the report is
  // in the model's own local frame regardless of where it was placed.
  const findings: Finding[] = []
  if (roots.length === 1) {
    roots[0].position.set(0, 0, 0)
    roots[0].quaternion.identity()
  } else if (roots.length === 0) {
    findings.push({ level: 'FAIL', msg: 'Model rendered nothing (no objects in scene).' })
  } else {
    findings.push({
      level: 'WARN',
      msg: `Model has ${roots.length} top-level objects, not a single root group; bounds measured in world frame (placement not normalized).`,
    })
  }
  scene.updateMatrixWorld(true)

  // Collect structural meshes.
  const meshes: { obj: THREE.Mesh; box: THREE.Box3 | null }[] = []
  const reports: MeshReport[] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (isTextLabel(mesh)) return

    const geom = mesh.geometry
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh
      ? (mesh as THREE.InstancedMesh).count
      : undefined

    let box: THREE.Box3 | null = new THREE.Box3().setFromObject(mesh)
    if (box.isEmpty() || !finite(box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z)) {
      box = box.isEmpty() ? null : box
    }

    const pos = geom?.attributes?.position
    const verts = pos ? pos.count : 0
    const tris = geom?.index ? geom.index.count / 3 : verts / 3
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const matDesc =
      mat instanceof THREE.MeshStandardMaterial && mat.color
        ? `${mat.type}(#${mat.color.getHexString()})`
        : (mat?.type ?? 'none')

    meshes.push({ obj: mesh, box: box && finite(box.min.x) ? box : null })
    reports.push({
      name: mesh.name || mesh.type,
      geometry: geom?.type ?? 'none',
      ...(inst !== undefined ? { instances: inst } : {}),
      vertices: verts,
      triangles: Math.round(tris),
      material: matDesc,
      box: box ? boxReport(box) : null,
    })
  })

  // Whole-model bounds.
  const total = new THREE.Box3()
  for (const m of meshes) if (m.box) total.union(m.box)
  const totalEmpty = total.isEmpty()
  const totalReport = totalEmpty ? null : boxReport(total)

  // ---- Checks -----------------------------------------------------------
  if (meshes.length === 0 && roots.length > 0) {
    findings.push({ level: 'FAIL', msg: 'No structural meshes found in the model.' })
  }

  // NaN / Infinity in any transform.
  for (const m of meshes) {
    const e = m.obj.matrixWorld.elements
    if (!e.every(Number.isFinite)) {
      findings.push({ level: 'FAIL', msg: `"${m.obj.name || m.obj.type}" has a non-finite world transform (NaN/Infinity).` })
    }
  }

  // Empty geometry.
  for (let i = 0; i < meshes.length; i++) {
    if (!meshes[i].box) {
      findings.push({ level: 'FAIL', msg: `"${reports[i].name}" has empty / zero-vertex geometry (${reports[i].geometry}).` })
    }
  }

  // Floating / detached parts: a mesh further than DETACH_GAP from every other.
  const boxed = meshes.filter((m) => m.box) as { obj: THREE.Mesh; box: THREE.Box3 }[]
  if (boxed.length > 1) {
    for (let i = 0; i < boxed.length; i++) {
      let nearest = Infinity
      for (let j = 0; j < boxed.length; j++) {
        if (i === j) continue
        nearest = Math.min(nearest, boxGap(boxed[i].box, boxed[j].box))
      }
      if (nearest > DETACH_GAP) {
        findings.push({
          level: 'WARN',
          msg: `"${boxed[i].obj.name || boxed[i].obj.type}" floats ${round(nearest)} units from the nearest other part — possible detached piece.`,
        })
      }
    }
  }

  // Ground alignment + size sanity (whole model).
  if (totalReport) {
    if (totalReport.min.y < -GROUND_SINK) {
      findings.push({ level: 'WARN', msg: `Model sinks ${round(-totalReport.min.y)} units below the ground plane (min.y=${totalReport.min.y}).` })
    } else if (totalReport.min.y > GROUND_FLOAT) {
      findings.push({ level: 'WARN', msg: `Model base floats ${totalReport.min.y} units above the ground (expected base near y=0).` })
    }
    const dims = [totalReport.size.x, totalReport.size.y, totalReport.size.z]
    if (dims.some((d) => d > MAX_DIM)) {
      findings.push({ level: 'WARN', msg: `Model is huge (${dims.map(round).join(' × ')}); a dimension exceeds ${MAX_DIM} units.` })
    }
    if (Math.max(...dims) < MIN_DIM) {
      findings.push({ level: 'WARN', msg: `Model is degenerate / near-zero size (${dims.map(round).join(' × ')}).` })
    }
  }

  // ---- Output -----------------------------------------------------------
  const fails = findings.filter((f) => f.level === 'FAIL')
  const warns = findings.filter((f) => f.level === 'WARN')

  console.log(`\nMODEL: ${name}`)
  console.log(`meshes: ${meshes.length}   triangles: ${reports.reduce((s, r) => s + r.triangles * (r.instances ?? 1), 0)}`)
  if (totalReport) {
    console.log(
      `bounds: size ${totalReport.size.x} × ${totalReport.size.y} × ${totalReport.size.z}  ` +
        `(x ${totalReport.min.x}..${totalReport.max.x}, y ${totalReport.min.y}..${totalReport.max.y}, z ${totalReport.min.z}..${totalReport.max.z})`,
    )
  }
  console.log('\nparts:')
  for (const r of reports) {
    const b = r.box
    const where = b ? `y ${b.min.y}..${b.max.y}  size ${b.size.x}×${b.size.y}×${b.size.z}` : 'EMPTY GEOMETRY'
    const inst = r.instances !== undefined ? ` x${r.instances}` : ''
    console.log(`  - ${r.name}${inst}  ${r.geometry}  ${r.material}  [${where}]`)
  }

  console.log('\nchecks:')
  if (findings.length === 0) {
    console.log('  ✓ no issues found')
  } else {
    for (const f of [...fails, ...warns]) console.log(`  ${f.level === 'FAIL' ? '✗' : '!'} ${f.level}: ${f.msg}`)
  }
  console.log(`\n${fails.length} FAIL, ${warns.length} WARN`)

  // Machine-readable block.
  const json = {
    model: name,
    meshCount: meshes.length,
    bounds: totalReport,
    parts: reports,
    findings,
    pass: fails.length === 0,
  }
  console.log('\n=== JSON ===')
  console.log(JSON.stringify(json, null, 2))

  await renderer.unmount()
  process.exit(fails.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(3)
})
