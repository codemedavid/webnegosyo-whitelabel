import { hasJustFinished, isTerminalStatus, statusPill } from './status'

describe('statusPill', () => {
  it('words the ready step for how the order is fulfilled', () => {
    expect(statusPill('ready', 'pickup')).toEqual({ label: 'Ready for pickup', tone: 'ready' })
    expect(statusPill('ready', 'delivery')).toEqual({ label: 'On the way', tone: 'ready' })
  })

  it('groups the in-kitchen states as in progress', () => {
    expect(statusPill('pending', 'pickup').tone).toBe('progress')
    expect(statusPill('preparing', 'dine_in')).toEqual({ label: 'Preparing', tone: 'progress' })
  })

  it('marks completed and cancelled orders', () => {
    expect(statusPill('delivered', 'dine_in')).toEqual({ label: 'Served', tone: 'done' })
    expect(statusPill('cancelled', 'pickup')).toEqual({ label: 'Cancelled', tone: 'cancelled' })
  })
})

describe('isTerminalStatus', () => {
  it('stops refreshing only once an order is completed or cancelled', () => {
    expect(isTerminalStatus('delivered')).toBe(true)
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(isTerminalStatus('ready')).toBe(false)
  })
})

describe('hasJustFinished', () => {
  it('is true only on the read that sees the order complete or get cancelled', () => {
    expect(hasJustFinished('ready', 'delivered')).toBe(true)
    expect(hasJustFinished('preparing', 'cancelled')).toBe(true)
    expect(hasJustFinished('delivered', 'delivered')).toBe(false)
    expect(hasJustFinished('pending', 'ready')).toBe(false)
  })

  it('ignores the first read of an order that finished long ago', () => {
    expect(hasJustFinished(undefined, 'delivered')).toBe(false)
  })
})
