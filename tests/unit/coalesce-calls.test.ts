/**
 * The live orders page refreshes its server data when an order arrives. A rush
 * of orders used to fire one full server render (layout + page + exact count)
 * per INSERT; the coalescer folds a burst into one trailing refresh, while a
 * sustained rush still refreshes at least every `maxWaitMs`.
 */

async function load() {
  return import('@/lib/coalesce-calls')
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('createCoalescer', () => {
  test('folds a burst of calls into one trailing call', async () => {
    // Arrange
    const { createCoalescer } = await load()
    const run = jest.fn()
    const coalescer = createCoalescer(run, { waitMs: 1000, maxWaitMs: 5000 })

    // Act
    coalescer.schedule()
    jest.advanceTimersByTime(300)
    coalescer.schedule()
    jest.advanceTimersByTime(300)
    coalescer.schedule()

    // Assert — nothing yet, then exactly one call once the burst goes quiet
    expect(run).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('still runs within maxWaitMs during a sustained stream of calls', async () => {
    const { createCoalescer } = await load()
    const run = jest.fn()
    const coalescer = createCoalescer(run, { waitMs: 1000, maxWaitMs: 3000 })

    // A call every 500ms never lets the 1s quiet window elapse.
    for (let elapsed = 0; elapsed < 3000; elapsed += 500) {
      coalescer.schedule()
      jest.advanceTimersByTime(500)
    }

    expect(run).toHaveBeenCalledTimes(1)
  })

  test('separate bursts each get their own call', async () => {
    const { createCoalescer } = await load()
    const run = jest.fn()
    const coalescer = createCoalescer(run, { waitMs: 1000, maxWaitMs: 5000 })

    coalescer.schedule()
    jest.advanceTimersByTime(1000)
    coalescer.schedule()
    jest.advanceTimersByTime(1000)

    expect(run).toHaveBeenCalledTimes(2)
  })

  test('cancel drops a pending call (unmount must not refresh a dead page)', async () => {
    const { createCoalescer } = await load()
    const run = jest.fn()
    const coalescer = createCoalescer(run, { waitMs: 1000, maxWaitMs: 5000 })

    coalescer.schedule()
    coalescer.cancel()
    jest.advanceTimersByTime(10_000)

    expect(run).not.toHaveBeenCalled()
  })
})

// A module, not a script: keeps this file's lazy `load` helper out of the global scope.
export {}
