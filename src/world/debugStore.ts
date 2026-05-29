let showPaths = false
const subs = new Set<(v: boolean) => void>()

export function isShowPaths(): boolean {
  return showPaths
}

export function setShowPaths(v: boolean): void {
  if (showPaths === v) return
  showPaths = v
  subs.forEach((fn) => fn(v))
}

export function subscribeShowPaths(fn: (v: boolean) => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

// Cheat: when on, spendGold succeeds without deducting so every upgrade node is
// testable. This module imports nothing, so playerStore can safely import it.
let unlimitedMoney = false
const moneySubs = new Set<(v: boolean) => void>()

export function isUnlimitedMoney(): boolean {
  return unlimitedMoney
}

export function setUnlimitedMoney(v: boolean): void {
  if (unlimitedMoney === v) return
  unlimitedMoney = v
  moneySubs.forEach((fn) => fn(v))
}

export function subscribeUnlimitedMoney(fn: (v: boolean) => void): () => void {
  moneySubs.add(fn)
  return () => {
    moneySubs.delete(fn)
  }
}
