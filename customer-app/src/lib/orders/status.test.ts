import { isTerminalStatus, statusPill } from './status'

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
