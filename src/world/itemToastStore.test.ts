import { describe, it, expect, beforeEach } from 'vitest'
import {
  pushItemToast,
  getItemToasts,
  removeItemToast,
  resetItemToasts,
  subscribeItemToasts,
  MAX_TOASTS,
} from './itemToastStore'

beforeEach(() => {
  resetItemToasts()
})

describe('pushItemToast', () => {
  it('adds a toast for the item with count 1', () => {
    pushItemToast('bread')
    const t = getItemToasts()
    expect(t).toHaveLength(1)
    expect(t[0].itemId).toBe('bread')
    expect(t[0].count).toBe(1)
  })

  it('merges a repeat pickup of the same item into one toast with a higher count', () => {
    pushItemToast('apple')
    pushItemToast('apple')
    pushItemToast('apple')
    const t = getItemToasts()
    expect(t).toHaveLength(1)
    expect(t[0].count).toBe(3)
  })

  it('keeps separate items as separate toasts', () => {
    pushItemToast('bread')
    pushItemToast('fur')
    expect(getItemToasts().map((x) => x.itemId)).toEqual(['bread', 'fur'])
  })

  it('caps the stack at MAX_TOASTS, dropping the oldest', () => {
    for (let i = 0; i < MAX_TOASTS + 2; i++) pushItemToast(`item_${i}`)
    const t = getItemToasts()
    expect(t).toHaveLength(MAX_TOASTS)
    expect(t[0].itemId).toBe('item_2') // first two dropped
  })
})

describe('removeItemToast', () => {
  it('removes the toast with the given id', () => {
    pushItemToast('bread')
    pushItemToast('fur')
    const id = getItemToasts()[0].id
    removeItemToast(id)
    expect(getItemToasts().map((x) => x.itemId)).toEqual(['fur'])
  })
})

describe('subscribeItemToasts', () => {
  it('notifies subscribers when a toast is pushed', () => {
    let calls = 0
    const unsub = subscribeItemToasts(() => {
      calls++
    })
    pushItemToast('bread')
    expect(calls).toBe(1)
    unsub()
    pushItemToast('fur')
    expect(calls).toBe(1) // no longer subscribed
  })
})
