import { PIPELINE_STAGES, stageReachedAt, summarizePipeline } from '@/lib/sales-pipeline/stages'
import { buildLead, hoursAgo, NOW_MS } from './fixtures'

const HOUR_MS = 60 * 60 * 1000

describe('PIPELINE_STAGES', () => {
  it('runs from the order form to the second month paid', () => {
    expect(PIPELINE_STAGES.map((stage) => stage.key)).toEqual([
      'ordered',
      'proof',
      'paid',
      'link_sent',
      'wizard_done',
      'built',
      'live',
      'first_order',
      'month_two',
    ])
  })
})

describe('stageReachedAt', () => {
  it('reads each stage from its own evidence', () => {
    const lead = buildLead({
      status: 'live',
      createdAt: hoursAgo(100),
      proofUploadedAt: hoursAgo(99),
      paidAt: hoursAgo(98),
      liveAt: hoursAgo(90),
      tenantId: 't-1',
      onboarding: {
        status: 'ready',
        createdAt: hoursAgo(97),
        startedAt: hoursAgo(95),
        finishedAt: hoursAgo(94),
        updatedAt: hoursAgo(94),
        error: null,
      },
      firstOrderAt: hoursAgo(80),
      secondPaymentAt: hoursAgo(10),
    })

    expect(stageReachedAt(lead, 'ordered')).toEqual({ isReached: true, atMs: NOW_MS - 100 * HOUR_MS })
    expect(stageReachedAt(lead, 'proof').atMs).toBe(NOW_MS - 99 * HOUR_MS)
    expect(stageReachedAt(lead, 'paid').atMs).toBe(NOW_MS - 98 * HOUR_MS)
    expect(stageReachedAt(lead, 'link_sent').atMs).toBe(NOW_MS - 97 * HOUR_MS)
    expect(stageReachedAt(lead, 'wizard_done').atMs).toBe(NOW_MS - 95 * HOUR_MS)
    expect(stageReachedAt(lead, 'built').atMs).toBe(NOW_MS - 94 * HOUR_MS)
    expect(stageReachedAt(lead, 'live').atMs).toBe(NOW_MS - 90 * HOUR_MS)
    expect(stageReachedAt(lead, 'first_order').atMs).toBe(NOW_MS - 80 * HOUR_MS)
    expect(stageReachedAt(lead, 'month_two').atMs).toBe(NOW_MS - 10 * HOUR_MS)
  })

  it('counts a skipped stage as passed, without a time, when a later stage was reached', () => {
    // The ₱999 funnel confirms payment out of band: no proof upload ever happens.
    const lead = buildLead({ status: 'paid', paidAt: hoursAgo(5) })

    expect(stageReachedAt(lead, 'proof')).toEqual({ isReached: true, atMs: null })
    expect(stageReachedAt(lead, 'paid')).toEqual({ isReached: true, atMs: NOW_MS - 5 * HOUR_MS })
    expect(stageReachedAt(lead, 'link_sent')).toEqual({ isReached: false, atMs: null })
  })

  it('treats a paid-looking status without a stamp as paid, time unknown', () => {
    const lead = buildLead({ status: 'setup_in_progress', paidAt: null })

    expect(stageReachedAt(lead, 'paid')).toEqual({ isReached: true, atMs: null })
  })

  it('does not count a wizard that was never submitted', () => {
    const lead = buildLead({
      status: 'paid',
      paidAt: hoursAgo(5),
      onboarding: {
        status: 'awaiting_details',
        createdAt: hoursAgo(4),
        startedAt: null,
        finishedAt: null,
        updatedAt: hoursAgo(4),
        error: null,
      },
    })

    expect(stageReachedAt(lead, 'link_sent').isReached).toBe(true)
    expect(stageReachedAt(lead, 'wizard_done').isReached).toBe(false)
    expect(stageReachedAt(lead, 'built').isReached).toBe(false)
  })

  it('does not count a failed build as built', () => {
    const lead = buildLead({
      status: 'paid',
      onboarding: {
        status: 'failed',
        createdAt: hoursAgo(4),
        startedAt: hoursAgo(3),
        finishedAt: hoursAgo(3),
        updatedAt: hoursAgo(3),
        error: 'menu parse failed',
      },
    })

    expect(stageReachedAt(lead, 'wizard_done').isReached).toBe(true)
    expect(stageReachedAt(lead, 'built').isReached).toBe(false)
  })

  it('ignores an unparseable timestamp rather than inventing a duration', () => {
    const lead = buildLead({ createdAt: 'not a date' })

    expect(stageReachedAt(lead, 'ordered')).toEqual({ isReached: true, atMs: null })
  })
})

describe('summarizePipeline', () => {
  it('returns every stage, even with no leads', () => {
    const summary = summarizePipeline([])

    expect(summary.stages).toHaveLength(PIPELINE_STAGES.length)
    expect(summary.stages.every((stage) => stage.count === 0)).toBe(true)
    expect(summary.stages[0].conversionPct).toBeNull()
    expect(summary.orderToLiveMedianMs).toBeNull()
  })

  it('counts each stage, and converts from the stage before', () => {
    const leads = [
      buildLead({ id: 'a' }),
      buildLead({ id: 'b', status: 'paid', paidAt: hoursAgo(10) }),
      buildLead({ id: 'c', status: 'live', paidAt: hoursAgo(10), liveAt: hoursAgo(5) }),
      buildLead({ id: 'd', status: 'live', paidAt: hoursAgo(10), liveAt: hoursAgo(5) }),
    ]

    const { stages } = summarizePipeline(leads)
    const byKey = Object.fromEntries(stages.map((stage) => [stage.key, stage]))

    expect(byKey.ordered.count).toBe(4)
    expect(byKey.ordered.conversionPct).toBeNull()
    // Paying implies the proof step, so the drop shows on "proof", not "paid".
    expect(byKey.proof.count).toBe(3)
    expect(byKey.proof.conversionPct).toBe(75)
    expect(byKey.paid.count).toBe(3)
    expect(byKey.paid.conversionPct).toBe(100)
    expect(byKey.live.count).toBe(2)
    // Live comes after "built": both live leads imply every stage in between.
    expect(byKey.built.count).toBe(2)
    expect(byKey.live.conversionPct).toBe(100)
    expect(byKey.first_order.conversionPct).toBe(0)
  })

  it('never shows a conversion from an empty stage', () => {
    const { stages } = summarizePipeline([buildLead()])

    const firstOrder = stages.find((stage) => stage.key === 'first_order')
    expect(firstOrder?.conversionPct).toBeNull()
  })

  it('takes the median step time only from leads with both stamps', () => {
    const leads = [
      buildLead({ id: 'a', createdAt: hoursAgo(10), status: 'paid', paidAt: hoursAgo(9) }),
      buildLead({ id: 'b', createdAt: hoursAgo(10), status: 'paid', paidAt: hoursAgo(7) }),
      buildLead({ id: 'c', createdAt: hoursAgo(10), status: 'paid', paidAt: hoursAgo(4) }),
      // Paid, but the stamp is missing: excluded from the median, still counted.
      buildLead({ id: 'd', createdAt: hoursAgo(10), status: 'paid', paidAt: null }),
    ]

    const paid = summarizePipeline(leads).stages.find((stage) => stage.key === 'paid')

    expect(paid?.count).toBe(4)
    // The step before "paid" is "proof", which none of them stamped: the step
    // time is measured from the last stage that WAS stamped (the order).
    expect(paid?.medianFromPreviousMs).toBe(3 * HOUR_MS)
  })

  it('averages the two middle values for an even sample', () => {
    const leads = [
      buildLead({ id: 'a', createdAt: hoursAgo(10), status: 'paid', paidAt: hoursAgo(9) }),
      buildLead({ id: 'b', createdAt: hoursAgo(10), status: 'paid', paidAt: hoursAgo(7) }),
    ]

    const paid = summarizePipeline(leads).stages.find((stage) => stage.key === 'paid')

    expect(paid?.medianFromPreviousMs).toBe(2 * HOUR_MS)
  })

  it('reports order → live and paid → live medians', () => {
    const leads = [
      buildLead({
        id: 'a',
        createdAt: hoursAgo(30),
        status: 'live',
        paidAt: hoursAgo(20),
        liveAt: hoursAgo(18),
      }),
    ]

    const summary = summarizePipeline(leads)

    expect(summary.orderToLiveMedianMs).toBe(12 * HOUR_MS)
    expect(summary.paidToLiveMedianMs).toBe(2 * HOUR_MS)
  })

  it('never reports a negative duration from backfilled stamps', () => {
    const leads = [
      buildLead({ id: 'a', createdAt: hoursAgo(10), status: 'live', paidAt: hoursAgo(2), liveAt: hoursAgo(5) }),
    ]

    const summary = summarizePipeline(leads)

    expect(summary.paidToLiveMedianMs).toBeNull()
  })
})
