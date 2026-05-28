import { useEffect, useRef } from 'react'

export interface KeyState {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  jump: boolean
}

export function useKeyboard() {
  const keys = useRef<KeyState>({
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
  })

  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.current.forward = down
          break
        case 'KeyS':
        case 'ArrowDown':
          keys.current.back = down
          break
        case 'KeyA':
        case 'ArrowLeft':
          keys.current.left = down
          break
        case 'KeyD':
        case 'ArrowRight':
          keys.current.right = down
          break
        case 'Space':
          keys.current.jump = down
          break
        default:
          return
      }
      // Don't let arrow keys / space scroll the page.
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
    }
    const onDown = (e: KeyboardEvent) => set(e, true)
    const onUp = (e: KeyboardEvent) => set(e, false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  return keys
}
