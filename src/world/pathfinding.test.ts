import { describe, it, expect, vi, beforeEach } from 'vitest'

// findPath consults tileMap / bridges / houseBlockers / obstacles to decide
// walkability. Mock all four with a tiny hand-drawn grid so the assertions read
// like the map itself. Grid legend (per setMap):
//   .  walkable ground (h0)      #  cliff (h>=2, impassable)
//   ~  water (null tile)         B  bridge over water (walkable)
//   O  obstacle prop (blocked)
const h = vi.hoisted(() => ({
  COLS: 30,
  ROWS: 30,
  heights: new Map<string, number>(),
  bridges: new Set<string>(),
  obstacles: new Set<string>(),
}))

vi.mock('./tileMap', () => ({
  COLS: h.COLS,
  ROWS: h.ROWS,
  tileAt: (x: number, z: number) => {
    const v = h.heights.get(`${x},${z}`)
    return v === undefined ? null : { height: v }
  },
  tileTopY: () => 0,
}))
vi.mock('./bridges', () => ({
  bridgeAt: (x: number, z: number) => (h.bridges.has(`${Math.floor(x)},${Math.floor(z)}`) ? { y: 0 } : null),
}))
vi.mock('./houseBlockers', () => ({ houseBlocksAt: () => false }))
vi.mock('./obstacles', () => ({
  isObstacleTile: (x: number, z: number) => h.obstacles.has(`${x},${z}`),
}))

import { findPath, type PathPoint } from './pathfinding'

function setMap(rows: string[]): void {
  h.heights.clear()
  h.bridges.clear()
  h.obstacles.clear()
  rows.forEach((row, z) => {
    ;[...row].forEach((ch, x) => {
      const at = `${x},${z}`
      if (ch === '.') h.heights.set(at, 0)
      else if (ch === '#') h.heights.set(at, 3)
      else if (ch === 'O') {
        h.heights.set(at, 0)
        h.obstacles.add(at)
      } else if (ch === 'B') h.bridges.add(at)
      // '~' (water) → leave the tile absent (tileAt returns null)
    })
  })
}

const has = (path: PathPoint[], x: number, z: number) =>
  path.some((p) => p.x === x + 0.5 && p.z === z + 0.5)

beforeEach(() => setMap([])) // clear between tests

describe('findPath', () => {
  it('walks a straight line across open ground', () => {
    setMap(['......', '......', '......'])
    const path = findPath({ x: 0, z: 0 }, { x: 5, z: 0 })
    expect(path.length).toBe(5)
    expect(path[path.length - 1]).toEqual({ x: 5.5, z: 0.5 }) // ends on the goal cell
    expect(has(path, 0, 0)).toBe(false) // start cell is not included
  })

  it('uses diagonals to cut the cost', () => {
    setMap(['....', '....', '....', '....'])
    const path = findPath({ x: 0, z: 0 }, { x: 3, z: 3 })
    expect(path.length).toBe(3) // three diagonal steps, not six orthogonal
    expect(path[path.length - 1]).toEqual({ x: 3.5, z: 3.5 })
  })

  it('routes around a cliff wall', () => {
    setMap([
      '.....',
      '.###.',
      '.....',
    ])
    const path = findPath({ x: 0, z: 1 }, { x: 4, z: 1 })
    expect(path.length).toBeGreaterThan(0)
    expect(path[path.length - 1]).toEqual({ x: 4.5, z: 1.5 })
    // never steps onto a cliff tile
    for (const c of [1, 2, 3]) expect(has(path, c, 1)).toBe(false)
  })

  it('routes around a blocking prop', () => {
    setMap(['...', '.O.', '...'])
    const path = findPath({ x: 0, z: 1 }, { x: 2, z: 1 })
    expect(path.length).toBeGreaterThan(0)
    expect(has(path, 1, 1)).toBe(false) // the obstacle tile
  })

  it('returns empty when the goal is walled off', () => {
    setMap([
      '.....',
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ])
    expect(findPath({ x: 0, z: 0 }, { x: 2, z: 2 })).toEqual([])
  })

  it('returns empty at the node budget', () => {
    setMap(['..........', '..........', '..........', '..........', '..........'])
    expect(findPath({ x: 0, z: 0 }, { x: 9, z: 4 }, 3)).toEqual([])
  })

  it('returns empty when start and goal share a cell', () => {
    setMap(['...', '...', '...'])
    expect(findPath({ x: 1, z: 1 }, { x: 1, z: 1 })).toEqual([])
  })

  it('treats a bridge tile as walkable water', () => {
    setMap([
      '~~~~~',
      '..B..',
      '~~~~~',
    ])
    const crossed = findPath({ x: 0, z: 1 }, { x: 4, z: 1 })
    expect(crossed.length).toBeGreaterThan(0)
    expect(has(crossed, 2, 1)).toBe(true) // path uses the bridge span

    // Same layout without the bridge: the water gap is impassable.
    setMap([
      '~~~~~',
      '..~..',
      '~~~~~',
    ])
    expect(findPath({ x: 0, z: 1 }, { x: 4, z: 1 })).toEqual([])
  })
})
