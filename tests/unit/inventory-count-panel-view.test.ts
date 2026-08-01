/**
 * What the count panel says, before any of it is rendered.
 *
 * The panel has one job beyond the two buttons: tell the merchant how much of
 * the shelf is still unlooked-at, in a unit they can act on. "38%" names
 * nothing they can walk to; "12 of 40 ingredients" names the aisle they are
 * standing in.
 *
 * The failure mode is the same one the whole feature exists to stop — a count
 * that reads as further along than it is, so the merchant closes it early and
 * the report calls the shelf accounted for.
 */

import { describeCountPanel } from '@/lib/inventory/count-panel'
import type { CountSessionProgress } from '@/lib/inventory/count-session'

function progress(overrides: Partial<CountSessionProgress> = {}): CountSessionProgress {
  return {
    state: 'open',
    countedCount: 12,
    expectedCount: 40,
    coveragePercent: 30,
    isShelfAccountedFor: false,
    ...overrides,
  }
}

describe('when no count is running', () => {
  it('offers to start one', () => {
    const panel = describeCountPanel(null)

    expect(panel.isCounting).toBe(false)
    expect(panel.actionLabel).toMatch(/start/i)
  })

  it('says what a count is for, not what it is called', () => {
    // A merchant who does not know why they would tap this will not tap it.
    const panel = describeCountPanel(null)

    expect(panel.detail).toMatch(/missing|shrinkage|unaccounted|match/i)
  })

  it('shows no progress figure, rather than a zero', () => {
    // "0 of 0 counted" on a shelf nobody is counting reads as a failure state.
    expect(describeCountPanel(null).progressLabel).toBeNull()
  })
})

describe('while a count is running', () => {
  it('counts the shelf in ingredients, not percent', () => {
    const panel = describeCountPanel(progress())

    expect(panel.progressLabel).toMatch(/12 of 40/)
  })

  it('names how many are still untouched, which is the number that ends the count', () => {
    // The merchant's actual question is "how much is left", and 28 is a pile
    // they can see. Making them subtract is how a count gets abandoned.
    const panel = describeCountPanel(progress())

    expect(panel.remainingCount).toBe(28)
    expect(panel.detail).toMatch(/28/)
  })

  it('offers to finish', () => {
    const panel = describeCountPanel(progress())

    expect(panel.isCounting).toBe(true)
    expect(panel.actionLabel).toMatch(/finish|close|done/i)
  })

  it('warns that finishing early leaves the rest unaccounted for', () => {
    // The one moment the merchant can still change the outcome. After they
    // close it, the report can only describe what happened.
    const panel = describeCountPanel(progress())

    expect(panel.closingWarning).toMatch(/28/)
    expect(panel.closingWarning).toMatch(/not counted|uncounted|unaccounted/i)
  })

  it('drops the warning once every ingredient has been reached', () => {
    // A warning that appears even on a finished count is noise, and noise is
    // how the warnings that matter stop being read.
    const panel = describeCountPanel(
      progress({ countedCount: 40, coveragePercent: 100 }),
    )

    expect(panel.remainingCount).toBe(0)
    expect(panel.closingWarning).toBeNull()
  })

  it('never reports a negative remainder when more was counted than scoped', () => {
    // An ingredient added mid-count is genuinely countable and genuinely
    // outside the snapshot, so the count can exceed its own denominator.
    // "-3 left" reads as a bug and discredits the figure beside it.
    const panel = describeCountPanel(
      progress({ countedCount: 43, coveragePercent: 100 }),
    )

    expect(panel.remainingCount).toBe(0)
  })

  it('withholds a progress figure when there was nothing in scope', () => {
    // A store with no tracked ingredients has not achieved a perfect count.
    const panel = describeCountPanel(
      progress({ countedCount: 0, expectedCount: 0, coveragePercent: null }),
    )

    expect(panel.progressLabel).toBeNull()
  })
})

describe('after a count is closed', () => {
  it('offers to start a new one rather than reopening the old', () => {
    // Reopening would move `closed_at`, and that timestamp is the evidence for
    // when the shelf was last accounted for.
    const panel = describeCountPanel(
      progress({ state: 'complete', countedCount: 40, coveragePercent: 100, isShelfAccountedFor: true }),
    )

    expect(panel.isCounting).toBe(false)
    expect(panel.actionLabel).toMatch(/start/i)
  })
})
