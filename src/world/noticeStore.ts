// A single transient system notice (e.g. "Lowered graphics for performance").
// Deliberately minimal — one line at a time, no stack — for automatic changes the
// player should be told about. Rendered by Notice.tsx, which owns the fade timing.

let message = ''
let born = 0
const subs = new Set<() => void>()

export function getNotice(): { message: string; born: number } {
  return { message, born }
}

export function showNotice(msg: string): void {
  message = msg
  born = typeof performance !== 'undefined' ? performance.now() : 0
  subs.forEach((fn) => fn())
}

export function clearNotice(): void {
  if (!message) return
  message = ''
  subs.forEach((fn) => fn())
}

export function subscribeNotice(fn: () => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
