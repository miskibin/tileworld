import { describe, it, expect, beforeEach } from 'vitest'
import { getQuality, setQuality, cycleQuality, subscribeQuality } from './qualityStore'

beforeEach(() => {
  setQuality('high') // known baseline between tests
})

describe('quality tiers', () => {
  it('setQuality changes the tier and notifies subscribers', () => {
    let seen: string | null = null
    const unsub = subscribeQuality((q) => {
      seen = q
    })
    expect(seen).toBe('high') // immediate call on subscribe
    setQuality('low')
    expect(getQuality()).toBe('low')
    expect(seen).toBe('low')
    unsub()
  })

  it('setQuality is a no-op for the same value (no extra notify)', () => {
    setQuality('medium')
    let calls = 0
    const unsub = subscribeQuality(() => {
      calls++
    })
    expect(calls).toBe(1) // immediate call only
    setQuality('medium') // unchanged → no notify
    expect(calls).toBe(1)
    unsub()
  })

  it('cycleQuality goes low -> medium -> high -> low', () => {
    setQuality('low')
    cycleQuality()
    expect(getQuality()).toBe('medium')
    cycleQuality()
    expect(getQuality()).toBe('high')
    cycleQuality()
    expect(getQuality()).toBe('low')
  })
})
