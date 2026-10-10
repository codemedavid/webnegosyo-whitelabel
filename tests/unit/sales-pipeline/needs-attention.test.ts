import { findNeedsAttention, needsAttentionFor } from '@/lib/sales-pipeline/needs-attention'
import type { PipelineOnboarding } from '@/lib/sales-pipeline/types'
import { buildLead, hoursAgo, NOW_MS } from './fixtures'

const HOUR_MS = 60 * 60 * 1000

function onboarding(overrides: Partial<PipelineOnboarding> = {}): PipelineOnboarding {
  return {
    status: 'awaiting_details',
    createdAt: hoursAgo(1),
    startedAt: null,
    finishedAt: null,
    updatedAt: hoursAgo(1),
    error: null,
    ...overrides,
  }
}

describe('needsAttentionFor', () => {
  it('asks staff to confirm an uploaded payment proof straight away', () => {
    const lead = buildLead({ proofUploadedAt: hoursAgo(2) })

    expect(needsAttentionFor(lead, NOW_MS)).toMatchObject({
      kind: 'confirm_payment',
      sinceMs: NOW_MS - 2 * HOUR_MS,
      isOverdue: false,
    })
  })

  it('marks a proof waiting longer than a day as overdue', () => {
    const lead = buildLead({ proofUploadedAt: hoursAgo(30) })

    expect(needsAttentionFor(lead, NOW_MS)).toMatchObject({ kind: 'confirm_payment', isOverdue: true })
  })

  it('asks staff to follow up an order that was never paid, after two days', () => {
    expect(needsAttentionFor(buildLead({ createdAt: hoursAgo(12) }), NOW_MS)).toBeNull()
    expect(needsAttentionFor(buildLead({ createdAt: hoursAgo(50) }), NOW_MS)).toMatchObject({
      kind: 'follow_up_unpaid',
    })
  })

  it('asks staff to send the set-up link once a lead is paid', () => {
    const lead = buildLead({ status: 'paid', paidAt: hoursAgo(3) })

    expect(needsAttentionFor(lead, NOW_MS)).toMatchObject({
      kind: 'send_link',
      sinceMs: NOW_MS - 3 * HOUR_MS,
    })
  })

  it('waits three days before nudging an owner who has not filled the form', () => {
    const fresh = buildLead({ status: 'paid', paidAt: hoursAgo(30), onboarding: onboarding({ createdAt: hoursAgo(24) }) })
    const stale = buildLead({ status: 'paid', paidAt: hoursAgo(80), onboarding: onboarding({ createdAt: hoursAgo(73) }) })

    expect(needsAttentionFor(fresh, NOW_MS)).toBeNull()
    expect(needsAttentionFor(stale, NOW_MS)).toMatchObject({ kind: 'nudge_owner' })
  })

  it('flags a failed build at once', () => {
    const lead = buildLead({
      status: 'paid',
      paidAt: hoursAgo(3),
      onboarding: onboarding({ status: 'failed', finishedAt: hoursAgo(1), updatedAt: hoursAgo(1), error: 'parse' }),
    })

    expect(needsAttentionFor(lead, NOW_MS)).toMatchObject({ kind: 'build_failed', detail: 'parse' })
  })

  it('reads a build that stopped moving as failed', () => {
    const lead = buildLead({
      status: 'paid',
      paidAt: hoursAgo(3),
      tenantId: 't-1',
      onboarding: onboarding({ status: 'running', startedAt: hoursAgo(2), updatedAt: hoursAgo(2) }),
    })

    expect(needsAttentionFor(lead, NOW_MS)).toMatchObject({ kind: 'build_failed' })
  })

  it('leaves a build that is still running alone', () => {
    const lead = buildLead({
      status: 'paid',
      paidAt: hoursAgo(3),
      tenantId: 't-1',
      onboarding: onboarding({ status: 'running', startedAt: new Date(NOW_MS - 60_000).toISOString(), updatedAt: new Date(NOW_MS - 60_000).toISOString() }),
    })

    expect(needsAttentionFor(lead, NOW_MS)).toBeNull()
  })

  it('flags a store that was built but has not opened after a day', () => {
    const lead = buildLead({
      status: 'paid',
      paidAt: hoursAgo(40),
      onboarding: onboarding({ status: 'ready', finishedAt: hoursAgo(30), updatedAt: hoursAgo(30) }),
    })

    expect(needsAttentionFor(lead, NOW_MS)).toMatchObject({ kind: 'not_live' })
  })

  it('flags a live store with no order after a week', () => {
    const quiet = buildLead({ status: 'live', paidAt: hoursAgo(200), liveAt: hoursAgo(170) })
    const busy = buildLead({ status: 'live', paidAt: hoursAgo(200), liveAt: hoursAgo(170), firstOrderAt: hoursAgo(100) })
    const fresh = buildLead({ status: 'live', paidAt: hoursAgo(30), liveAt: hoursAgo(20) })

    expect(needsAttentionFor(quiet, NOW_MS)).toMatchObject({ kind: 'no_first_order' })
    expect(needsAttentionFor(busy, NOW_MS)).toBeNull()
    expect(needsAttentionFor(fresh, NOW_MS)).toBeNull()
  })

  it('treats a live store as live even when its build row still reads failed', () => {
    const lead = buildLead({
      status: 'live',
      paidAt: hoursAgo(30),
      liveAt: hoursAgo(20),
      onboarding: onboarding({ status: 'failed', finishedAt: hoursAgo(25), updatedAt: hoursAgo(25), error: 'parse' }),
    })

    expect(needsAttentionFor(lead, NOW_MS)).toBeNull()
  })

  it('keeps a live lead with no live stamp visible, timed from payment', () => {
    const lead = buildLead({ status: 'live', paidAt: hoursAgo(200), liveAt: null })

    expect(needsAttentionFor(lead, NOW_MS)).toMatchObject({ kind: 'no_first_order', sinceMs: NOW_MS - 200 * HOUR_MS })
  })

  it('never asks anything about a cancelled lead', () => {
    const lead = buildLead({ status: 'cancelled', proofUploadedAt: hoursAgo(50) })

    expect(needsAttentionFor(lead, NOW_MS)).toBeNull()
  })
})

describe('findNeedsAttention', () => {
  it('groups by action in pipeline order, oldest first inside each group', () => {
    const leads = [
      buildLead({ id: 'new-proof', proofUploadedAt: hoursAgo(1) }),
      buildLead({ id: 'old-proof', proofUploadedAt: hoursAgo(20) }),
      buildLead({ id: 'paid', status: 'paid', paidAt: hoursAgo(2) }),
      buildLead({ id: 'fine', createdAt: hoursAgo(1) }),
    ]

    const groups = findNeedsAttention(leads, NOW_MS)

    expect(groups.map((group) => group.kind)).toEqual(['confirm_payment', 'send_link'])
    expect(groups[0].items.map((item) => item.lead.id)).toEqual(['old-proof', 'new-proof'])
    expect(groups[0].overdueCount).toBe(0)
  })

  it('returns nothing when nobody is waiting on a human', () => {
    expect(findNeedsAttention([buildLead({ createdAt: hoursAgo(1) })], NOW_MS)).toEqual([])
  })
})
