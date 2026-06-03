import { playShopOpen } from '../audio/sfx'

export interface ShopItem {
  id: string
  name: string
  icon: string
  price: number
  /** sim-time effect applied when bought; return false if unable to buy */
  apply: () => boolean
}

interface ActiveShop {
  id: string
  title: string
  items: ShopItem[]
}

let active: ActiveShop | null = null
const subs = new Set<(s: ActiveShop | null) => void>()

export function openShop(s: ActiveShop): void {
  active = s
  playShopOpen()
  subs.forEach((fn) => fn(active))
}

export function closeShop(): void {
  if (active === null) return
  active = null
  subs.forEach((fn) => fn(active))
}

export function isShopOpen(): boolean {
  return active !== null
}

export function getActiveShop(): ActiveShop | null {
  return active
}

export function subscribeShop(fn: (s: ActiveShop | null) => void): () => void {
  subs.add(fn)
  fn(active) // seed with current state, like every other store's subscribe
  return () => {
    subs.delete(fn)
  }
}

// ─── Merchant Guild discount (Economy upgrade) ──────────────────────────
// A flat multiplier on every shop price. 1 = full price; 0.8 once the Merchant
// Guild is purchased. Toggled once at purchase time (no per-frame churn), so a
// plain module flag is enough — no subscription needed.
let shopDiscount = 1

export function getShopDiscount(): number {
  return shopDiscount
}

export function setShopDiscount(v: number): void {
  shopDiscount = v
}

/** A base price after the active Merchant Guild discount, rounded to whole gold. */
export function discountedPrice(price: number): number {
  return Math.round(price * shopDiscount)
}

export function resetShopDiscount(): void {
  shopDiscount = 1
}
