import { ORDER_POLL_MS, orderPollInterval } from './polling'

describe('orderPollInterval', () => {
  const live = { status: 'preparing' as const, isFocused: true, isAppActive: true }

  it('polls every 15 s while a live order is on screen', () => {
    expect(orderPollInterval(live)).toBe(ORDER_POLL_MS)
    expect(ORDER_POLL_MS).toBe(15_000)
    // Before the first answer arrives there is nothing to stop on yet.
    expect(orderPollInterval({ ...live, status: undefined })).toBe(ORDER_POLL_MS)
  })

  it('stops at a terminal status', () => {
    expect(orderPollInterval({ ...live, status: 'delivered' })).toBe(false)
    expect(orderPollInterval({ ...live, status: 'cancelled' })).toBe(false)
  })

  it('stops when the screen loses focus or the app goes to the background', () => {
    expect(orderPollInterval({ ...live, isFocused: false })).toBe(false)
    expect(orderPollInterval({ ...live, isAppActive: false })).toBe(false)
  })
})
