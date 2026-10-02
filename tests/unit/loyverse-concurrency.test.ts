import { forEachWithConcurrency } from '@/lib/loyverse/concurrency'

describe('forEachWithConcurrency', () => {
  it('never runs more than the limit at once and visits every item', async () => {
    let inFlight = 0
    let peak = 0
    const seen: number[] = []

    await forEachWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      seen.push(item)
      inFlight--
    })

    expect(peak).toBe(2)
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('stops starting new items once the budget says so, and reports how many started', async () => {
    let budget = 3
    const started = await forEachWithConcurrency([1, 2, 3, 4, 5], 1, async () => {}, () => budget-- > 0)

    expect(started).toBe(3)
  })

  it('handles an empty list', async () => {
    await expect(forEachWithConcurrency([], 3, async () => {})).resolves.toBe(0)
  })
})
