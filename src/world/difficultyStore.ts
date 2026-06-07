// Difficulty preset. Three presets scale the night assault only (ork count, ork
// HP, and the length of the prep "day"); they touch nothing else. Chosen on the
// StartScreen before a run and persisted to localStorage. Module-level external
// store, same shape as the rest of src/world/*Store.ts. NOT cleared by resetRun()
// — it's a setting, so it survives "Play Again" / "Return to Menu".

export type Difficulty = 'easy' | 'normal' | 'hard'

/** Multipliers applied to wave count / ork HP / prep duration. */
export interface DiffMods {
  countMul: number
  hpMul: number
  prepMul: number
}

// easy   = fewer, softer orks + a longer day to prepare
// normal = the tuned baseline (all 1.0)
// hard   = more, tougher orks + a shorter day
const MODS: Record<Difficulty, DiffMods> = {
  easy: { countMul: 0.8, hpMul: 0.85, prepMul: 1.25 },
  normal: { countMul: 1.0, hpMul: 1.0, prepMul: 1.0 },
  hard: { countMul: 1.25, hpMul: 1.2, prepMul: 0.8 },
}

const STORAGE_KEY = 'tileworld.difficulty'

function load(): Difficulty {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'easy' || v === 'normal' || v === 'hard') return v
    return 'normal'
  } catch {
    return 'normal'
  }
}

let difficulty: Difficulty = load()
const subs = new Set<(d: Difficulty) => void>()

export function getDifficulty(): Difficulty {
  return difficulty
}

/** The active preset's multipliers. */
export function getMods(): DiffMods {
  return MODS[difficulty]
}

/** Look up a specific preset's multipliers (used by tests / previews). */
export function modsFor(d: Difficulty): DiffMods {
  return MODS[d]
}

export function setDifficulty(d: Difficulty): void {
  if (d === difficulty) return
  difficulty = d
  try {
    localStorage.setItem(STORAGE_KEY, d)
  } catch {
    /* private mode / no storage — runtime switch still works, just not persisted */
  }
  subs.forEach((fn) => fn(d))
}

export function subscribeDifficulty(fn: (d: Difficulty) => void): () => void {
  subs.add(fn)
  fn(difficulty)
  return () => {
    subs.delete(fn)
  }
}
