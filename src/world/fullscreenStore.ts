// Fullscreen toggle. Wraps the Fullscreen API so the HUD can drive it like any
// other store. Works in the browser and in the Tauri webview (both expose the
// standard requestFullscreen/exitFullscreen on the document element). The live
// truth is document.fullscreenElement; we mirror it into a store value and keep
// it in sync via the 'fullscreenchange' event (covers the user pressing F11 / Esc
// outside our UI too).

let enabled = false
const subs = new Set<(v: boolean) => void>()

function notify(): void {
  subs.forEach((fn) => fn(enabled))
}

function sync(): void {
  const next = typeof document !== 'undefined' && !!document.fullscreenElement
  if (next === enabled) return
  enabled = next
  notify()
}

// Keep the store honest when fullscreen changes by any route (our button, F11,
// Esc, the OS). Registered once at module load.
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', sync)
}

export function isFullscreen(): boolean {
  return enabled
}

/** Request or exit fullscreen. Must be called from a user gesture (a click) or
 *  the browser rejects the request — we swallow that rejection and leave the
 *  state unchanged (the 'fullscreenchange' listener is the source of truth). */
export function toggleFullscreen(): void {
  if (typeof document === 'undefined') return
  try {
    // These return Promises; an async rejection (e.g. the browser denies the
    // request outside a user gesture) bypasses the try/catch, so swallow it on
    // the promise too — the 'fullscreenchange' listener stays the source of truth.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {})
    }
  } catch {
    /* not allowed / unsupported — ignore, state stays as-is */
  }
}

export function subscribeFullscreen(fn: (v: boolean) => void): () => void {
  subs.add(fn)
  fn(enabled)
  return () => {
    subs.delete(fn)
  }
}
