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
  return () => {
    subs.delete(fn)
  }
}
