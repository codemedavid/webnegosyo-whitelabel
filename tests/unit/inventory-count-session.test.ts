/**
 * What a stock count session is worth once it is over.
 *
 * Attribution answered "who counted this". This answers the question that
 * outlives it: which ingredients belonged to ONE count, and therefore whether a
 * shelf full of zero-shrinkage rows is a clean day or a count that stopped
 * halfway down the aisle.
 *
 * Every case below is a way of reading a half-finished count as a good one,
 * because that is the only failure mode here that costs money: it retires a
 * suspicion the merchant should have kept.
 */
import {
  judgeCountSession,
  describeCountSession,
} from '@/lib/inventory/count-session'

describe('judging a count session', () => {
  it('calls a count still in progress open rather than partial', () => {
    // Nobody has claimed to be finished, so nothing is missing yet. Calling an
    // in-flight count "partial" would train the merchant to ignore the word by
    // the time it means something.
    const progress = judgeCountSession({
      expectedItemCount: 40,
      countedItemIds: ['a', 'b', 'c'],
      closedAt: null,
    })

    expect(progress.state).toBe('open')
  })

  it('calls a closed count that reached every ingredient complete', () => {
    const progress = judgeCountSession({
      expectedItemCount: 3,
      countedItemIds: ['a', 'b', 'c'],
      closedAt: '2026-07-31T14:00:00+08:00',
    })

    expect(progress.state).toBe('complete')
    expect(progress.coveragePercent).toBe(100)
  })

  it('calls a closed count that stopped halfway partial', () => {
    // THE POINT OF THE WHOLE TABLE. Without the session, twenty uncounted
    // ingredients and twenty perfectly reconciled ones look identical on the
    // report: both show zero shrinkage.
    const progress = judgeCountSession({
      expectedItemCount: 40,
      countedItemIds: ['a', 'b', 'c', 'd'],
      closedAt: '2026-07-31T14:00:00+08:00',
    })

    expect(progress.state).toBe('partial')
    expect(progress.countedCount).toBe(4)
    expect(progress.expectedCount).toBe(40)
  })

  it('distinguishes a count nobody ever started from one that stopped early', () => {
    // Closed with nothing counted is not a small count — it is an abandoned
    // one, and it says something different about the shift.
    const progress = judgeCountSession({
      expectedItemCount: 40,
      countedItemIds: [],
      closedAt: '2026-07-31T14:00:00+08:00',
    })

    expect(progress.state).toBe('abandoned')
  })

  it('counts an ingredient once however many times it was recounted', () => {
    // Recounting the flour three times because the number looked wrong is good
    // practice. Reading it as three ingredients would let one stubborn sack
    // report a finished count.
    const progress = judgeCountSession({
      expectedItemCount: 4,
      countedItemIds: ['flour', 'flour', 'flour'],
      closedAt: '2026-07-31T14:00:00+08:00',
    })

    expect(progress.countedCount).toBe(1)
    expect(progress.state).toBe('partial')
  })

  it('withholds a coverage figure when nothing was in scope', () => {
    // 0 of 0 is arithmetically 100% and factually meaningless. A store with no
    // tracked ingredients has not achieved a perfect count; it has nothing to
    // count, and a green "100%" would be the report's most confident lie.
    const progress = judgeCountSession({
      expectedItemCount: 0,
      countedItemIds: [],
      closedAt: '2026-07-31T14:00:00+08:00',
    })

    expect(progress.coveragePercent).toBeNull()
    expect(progress.state).toBe('abandoned')
  })

  it('never reports more than full coverage when an ingredient was added mid-count', () => {
    // expectedItemCount is a SNAPSHOT taken when the session opened. An
    // ingredient added while the merchant was counting is genuinely countable
    // and genuinely not in the denominator — so the count can exceed it. "107%
    // counted" reads as a bug and discredits the figure beside it.
    const progress = judgeCountSession({
      expectedItemCount: 3,
      countedItemIds: ['a', 'b', 'c', 'd'],
      closedAt: '2026-07-31T14:00:00+08:00',
    })

    expect(progress.coveragePercent).toBe(100)
    expect(progress.state).toBe('complete')
  })

  it('rounds coverage down so a near-complete count never reads as finished', () => {
    // 39 of 40 is 97.5%. Rounding to "98%" is fine; rounding 99.6% up to "100%"
    // on a shelf with an uncounted ingredient is exactly the reassurance this
    // module exists to withhold.
    const progress = judgeCountSession({
      expectedItemCount: 300,
      countedItemIds: Array.from({ length: 299 }, (_, index) => `item-${index}`),
      closedAt: '2026-07-31T14:00:00+08:00',
    })

    expect(progress.coveragePercent).toBe(99)
    expect(progress.state).toBe('partial')
  })

  it('trusts the silence of an uncounted ingredient only after a complete count', () => {
    // The reason the report cares at all. After a complete count, an ingredient
    // with no discrepancy really did reconcile. After a partial one, the same
    // row means only that nobody looked.
    const complete = judgeCountSession({
      expectedItemCount: 2,
      countedItemIds: ['a', 'b'],
      closedAt: '2026-07-31T14:00:00+08:00',
    })
    const partial = judgeCountSession({
      expectedItemCount: 2,
      countedItemIds: ['a'],
      closedAt: '2026-07-31T14:00:00+08:00',
    })

    expect(complete.isShelfAccountedFor).toBe(true)
    expect(partial.isShelfAccountedFor).toBe(false)
  })

  it('does not treat an open count as accounting for the shelf', () => {
    const progress = judgeCountSession({
      expectedItemCount: 2,
      countedItemIds: ['a', 'b'],
      closedAt: null,
    })

    expect(progress.isShelfAccountedFor).toBe(false)
  })

  it('treats a negative expected count as no scope at all rather than throwing', () => {
    // Nothing writes a negative snapshot today. This is a read-only report over
    // merchant data, and a corrupt row must cost the merchant their coverage
    // figure, not their whole stock report.
    const progress = judgeCountSession({
      expectedItemCount: -5,
      countedItemIds: ['a'],
      closedAt: '2026-07-31T14:00:00+08:00',
    })

    expect(progress.coveragePercent).toBeNull()
  })
})

describe('wording a count session for the merchant', () => {
  it('says how far a partial count got, in ingredients rather than percent', () => {
    // "10%" tells a merchant nothing they can act on. "4 of 40 ingredients"
    // tells them the aisle they stopped at.
    const sentence = describeCountSession(
      judgeCountSession({
        expectedItemCount: 40,
        countedItemIds: ['a', 'b', 'c', 'd'],
        closedAt: '2026-07-31T14:00:00+08:00',
      }),
    )

    expect(sentence).toMatch(/4 of 40/)
  })

  it('warns outright that the uncounted ingredients prove nothing', () => {
    const sentence = describeCountSession(
      judgeCountSession({
        expectedItemCount: 40,
        countedItemIds: ['a'],
        closedAt: '2026-07-31T14:00:00+08:00',
      }),
    )

    expect(sentence).toMatch(/not counted|were never counted|nobody counted/i)
  })

  it('says nothing at all about a complete count', () => {
    // A caveat that appears on a good day is noise, and noise is how the real
    // caveats stop being read.
    const sentence = describeCountSession(
      judgeCountSession({
        expectedItemCount: 2,
        countedItemIds: ['a', 'b'],
        closedAt: '2026-07-31T14:00:00+08:00',
      }),
    )

    expect(sentence).toBeNull()
  })

  it('says a count is still running rather than warning about it', () => {
    const sentence = describeCountSession(
      judgeCountSession({
        expectedItemCount: 40,
        countedItemIds: ['a'],
        closedAt: null,
      }),
    )

    expect(sentence).toMatch(/still|in progress/i)
  })
})
