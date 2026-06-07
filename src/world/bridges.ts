export interface BridgeSpan {
  fromX: number
  fromZ: number
  toX: number
  toZ: number
  width: number
  y: number
}

const bridges: BridgeSpan[] = []

export function registerBridge(span: BridgeSpan): void {
  // Dedupe by endpoints so React strict-mode/HMR double-mounts don't pile up.
  for (let i = 0; i < bridges.length; i++) {
    const b = bridges[i]
    if (
      b.fromX === span.fromX &&
      b.fromZ === span.fromZ &&
      b.toX === span.toX &&
      b.toZ === span.toZ
    ) {
      // Update existing in case width/y changed.
      bridges[i] = span
      return
    }
  }
  bridges.push(span)
}

export function resetBridges(): void {
  bridges.length = 0
}

/**
 * Returns the bridge span the (x, z) point lies on, or null.
 * Bridge is treated as a rectangle aligned with its axis from→to.
 */
export function bridgeAt(x: number, z: number): BridgeSpan | null {
  for (let i = 0; i < bridges.length; i++) {
    const b = bridges[i]
    const dx = b.toX - b.fromX
    const dz = b.toZ - b.fromZ
    const len = Math.hypot(dx, dz)
    if (len < 0.001) continue
    const ux = dx / len
    const uz = dz / len
    const px = x - b.fromX
    const pz = z - b.fromZ
    const along = px * ux + pz * uz
    // Small overhang so bridge approach edges count too.
    if (along < -0.4 || along > len + 0.4) continue
    const perp = px * -uz + pz * ux
    if (Math.abs(perp) > b.width / 2) continue
    return b
  }
  return null
}
