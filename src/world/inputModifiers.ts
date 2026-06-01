// Tracks whether Alt is currently held, from keyboard events.
//
// Why not just read `WheelEvent.altKey`? On some platforms (notably Windows
// Chrome/Edge) a wheel event fired while Alt is down arrives with
// `altKey === false` — the OS routes Alt+wheel without flagging the modifier on
// the wheel event. That made "Alt+scroll = zoom" unreliable: the hotbar saw a
// plain scroll and cycled instead. Tracking Alt from keydown/keyup is robust;
// consumers OR this with the event's own altKey.

let altHeld = false

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') altHeld = true
  })
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') altHeld = false
  })
  // Focus loss (Alt+Tab, menu activation) can swallow the keyup, which would
  // otherwise leave Alt stuck "held" — clear it defensively.
  window.addEventListener('blur', () => {
    altHeld = false
  })
}

/** True while Alt is held (keyboard-tracked, not from the wheel event). */
export function isAltHeld(): boolean {
  return altHeld
}
