import { describe, it, expect } from 'vitest'
import { shouldPauseOnFullscreenExit } from './pauseStore'

// The browser reserves Esc to exit fullscreen and (in Chrome) swallows the
// keydown, so PauseMenu's Esc->togglePaused handler never fires while fullscreen.
// We treat the fullscreen exit itself as the pause request. These tests pin the
// exact conditions under which that substitution should kick in.
describe('shouldPauseOnFullscreenExit', () => {
  const playing = { started: true, modalOpen: false, paused: false }

  it('opens pause when fullscreen drops mid-run with nothing else open', () => {
    expect(shouldPauseOnFullscreenExit(true, false, playing)).toBe(true)
  })

  it('does nothing when entering fullscreen (false -> true)', () => {
    expect(shouldPauseOnFullscreenExit(false, true, playing)).toBe(false)
  })

  it('does nothing when fullscreen state is unchanged', () => {
    expect(shouldPauseOnFullscreenExit(true, true, playing)).toBe(false)
    expect(shouldPauseOnFullscreenExit(false, false, playing)).toBe(false)
  })

  it('stays out of the way before the game has started (menu)', () => {
    expect(
      shouldPauseOnFullscreenExit(true, false, { ...playing, started: false }),
    ).toBe(false)
  })

  it('defers to an open modal (shop / tree / inventory / settings own Esc)', () => {
    expect(
      shouldPauseOnFullscreenExit(true, false, { ...playing, modalOpen: true }),
    ).toBe(false)
  })

  it('is idempotent — does not re-toggle if already paused (Firefox delivers both keydown + fullscreenchange)', () => {
    expect(
      shouldPauseOnFullscreenExit(true, false, { ...playing, paused: true }),
    ).toBe(false)
  })
})
