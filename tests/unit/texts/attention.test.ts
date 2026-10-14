/**
 * Needs attention: what the owner must fix, in the words and order of
 * ux-spec C.4. Urgent before warnings, then the spec's order. Every row
 * links somewhere on the same page (relative URLs). The list is returned
 * whole; showing three is the strip's job.
 */

import { FAILURE_SPIKE_MIN, buildAttention, type AttentionInput } from '@/lib/texts/attention'
import type { SenderSummary, SendingPhone } from '@/lib/texts/types'

const NOW = new Date('2026-10-14T02:00:00Z') // 10:00 AM Manila

function phone(overrides: Partial<SendingPhone> = {}): SendingPhone {
  return {
    deviceId: 'dev-1', name: "Juan's Galaxy A15", hasCustomName: true, model: 'SM-A155F', appVersion: '1.0.13',
    isAppOld: false, state: 'ready', lastSeenAt: NOW.toISOString(), ageSeconds: 5, isInactive: false,
    connectedAt: null, connectedBy: null, sentToday: 0, failedToday: 0, sendingNow: 0, smsPermission: true,
    isBatteryUnrestricted: true, ...overrides,
  }
}

function sender(overrides: Partial<SenderSummary> = {}): SenderSummary {
  const phones = overrides.phones ?? [phone()]
  return {
    heroState: 'ready', primary: phones[0] ?? null, phones, maxPhones: 5, waiting: 0, sentToday: 0, dailyLimit: 100,
    isQuietNow: false, quietUntil: null, allOutBy: null, sending: null, now: NOW.toISOString(), ...overrides,
  }
}

function input(overrides: Partial<AttentionInput> = {}): AttentionInput {
  return { now: NOW, sender: sender(), campaigns: [], emptyAudienceCampaignIds: [], isReviewLinkMissing: false, ...overrides }
}

const campaign = (overrides: Partial<AttentionInput['campaigns'][number]> = {}) => ({
  id: 'c1', name: 'Weekend reminder', status: 'scheduled' as const, displayState: 'scheduled' as const,
  pauseReason: null, nextSendAt: null, ...overrides,
})

describe('buildAttention', () => {
  it('is empty when all is well (no "all good" row)', () => {
    expect(buildAttention(input())).toEqual([])
  })

  it('flags texts waiting with no phone or an offline phone', () => {
    const offline = buildAttention(input({ sender: sender({ heroState: 'offline', waiting: 34 }) }))
    expect(offline).toEqual([{
      id: 'waiting_no_phone', kind: 'waiting_no_phone', severity: 'urgent',
      text: '34 texts are waiting for your phone.', action: { label: 'Fix it', href: '?phones=1' },
    }])
    const none = buildAttention(input({ sender: sender({ heroState: 'none', phones: [], waiting: 1 }) }))
    expect(none[0].text).toBe('1 text is waiting for your phone.')
  })

  it('says nothing about waiting texts while a phone is ready, late or the read failed', () => {
    for (const heroState of ['ready', 'late', 'resting', 'unknown'] as const) {
      expect(buildAttention(input({ sender: sender({ heroState, waiting: 12 }) }))).toEqual([])
    }
  })

  it('flags a campaign that paused itself for want of a phone', () => {
    const items = buildAttention(input({ campaigns: [campaign({ status: 'paused', displayState: 'paused', pauseReason: 'missed_no_phone' })] }))
    expect(items).toEqual([expect.objectContaining({
      id: 'campaign_paused_itself:c1', severity: 'urgent',
      text: 'Weekend reminder paused: no phone checked in for a day.', action: { label: 'Review', href: '?campaign=c1' },
    })])
    expect(buildAttention(input({ campaigns: [campaign({ status: 'paused', displayState: 'paused', pauseReason: 'owner' })] }))).toEqual([])
  })

  it(`flags a failure spike: at least ${FAILURE_SPIKE_MIN} failed and at least 30% of today's attempts`, () => {
    const spike = buildAttention(input({ sender: sender({ phones: [phone({ sentToday: 21, failedToday: 9 })] }) }))
    expect(spike).toEqual([expect.objectContaining({
      kind: 'failure_spike', text: "9 texts couldn't send today. The SIM may be out of load or blocked.",
      action: { label: 'See which', href: '?tab=activity&show=not_sent' },
    })])
    expect(buildAttention(input({ sender: sender({ phones: [phone({ sentToday: 0, failedToday: 4 })] }) }))).toEqual([])
    expect(buildAttention(input({ sender: sender({ phones: [phone({ sentToday: 30, failedToday: 12 })] }) }))).toEqual([])
  })

  it('adds up failures across phones', () => {
    const phones = [phone({ deviceId: 'a', failedToday: 3, sentToday: 2 }), phone({ deviceId: 'b', failedToday: 3, sentToday: 2 })]
    expect(buildAttention(input({ sender: sender({ phones }) }))[0].kind).toBe('failure_spike')
  })

  it('flags a campaign starting within a day while the phone is offline', () => {
    const soon = campaign({ id: 'c2', name: 'Friday promo', nextSendAt: '2026-10-14T06:00:00Z' })
    const later = campaign({ id: 'c3', name: 'Next week', nextSendAt: '2026-10-20T02:00:00Z' })
    const items = buildAttention(input({ sender: sender({ heroState: 'offline' }), campaigns: [soon, later] }))
    expect(items).toEqual([expect.objectContaining({
      id: 'starts_soon_offline:c2', text: 'Friday promo starts at 2:00 PM and your phone is offline.',
      action: { label: 'Fix it', href: '?phones=1' },
    })])
    const tomorrow = campaign({ id: 'c4', name: 'Friday promo', nextSendAt: '2026-10-15T01:00:00Z' })
    expect(buildAttention(input({ sender: sender({ heroState: 'offline' }), campaigns: [tomorrow] }))[0].text)
      .toBe('Friday promo starts tomorrow at 9:00 AM and your phone is offline.')
    expect(buildAttention(input({ campaigns: [soon] }))).toEqual([])
  })

  it('flags a scheduled campaign no one matches', () => {
    const items = buildAttention(input({ campaigns: [campaign({ name: 'Thank your regulars' })], emptyAudienceCampaignIds: ['c1'] }))
    expect(items).toEqual([expect.objectContaining({
      severity: 'warn', text: 'No one matches Thank your regulars right now.', action: { label: 'Edit', href: '?campaign=c1&edit=1' },
    })])
  })

  it('ignores an empty audience on a campaign that is not scheduled', () => {
    const draft = campaign({ status: 'draft', displayState: 'draft' })
    expect(buildAttention(input({ campaigns: [draft], emptyAudienceCampaignIds: ['c1'] }))).toEqual([])
  })

  it('flags a missing review link', () => {
    expect(buildAttention(input({ isReviewLinkMissing: true }))).toEqual([expect.objectContaining({
      severity: 'warn', text: 'Review request needs your review link.', action: { label: 'Add link', href: '?tab=rules&focus=review_link' },
    })])
  })

  it('flags a phone that needs an app update or has SMS permission off', () => {
    const old = buildAttention(input({ sender: sender({ phones: [phone({ isAppOld: true })] }) }))
    expect(old).toEqual([expect.objectContaining({
      id: 'phone_needs_fix:dev-1', severity: 'warn', text: "Juan's Galaxy A15 needs an app update.",
      action: { label: 'Phones', href: '?phones=1&phone=dev-1' },
    })])
    const sms = buildAttention(input({ sender: sender({ phones: [phone({ smsPermission: false })] }) }))
    expect(sms[0]).toMatchObject({ severity: 'urgent', text: "Juan's Galaxy A15 can't send: SMS permission is off." })
  })

  it('orders urgent before warnings, then by the spec order', () => {
    const items = buildAttention(input({
      sender: sender({ heroState: 'offline', waiting: 3, phones: [phone({ state: 'offline', isAppOld: true, failedToday: 6 })] }),
      campaigns: [
        campaign({ id: 'p', name: 'P', status: 'paused', displayState: 'paused', pauseReason: 'missed_no_phone' }),
        campaign({ id: 's', name: 'S', nextSendAt: '2026-10-14T03:00:00Z' }),
        campaign({ id: 'e', name: 'E' }),
      ],
      emptyAudienceCampaignIds: ['e'],
      isReviewLinkMissing: true,
    }))
    expect(items.map((item) => item.kind)).toEqual([
      'waiting_no_phone', 'campaign_paused_itself', 'failure_spike', 'starts_soon_offline',
      'campaign_no_one', 'review_link_missing', 'phone_needs_fix',
    ])
  })

  it('url-encodes ids in links', () => {
    const items = buildAttention(input({ campaigns: [campaign({ id: 'a&b', status: 'paused', displayState: 'paused', pauseReason: 'missed_no_phone' })] }))
    expect(items[0].action.href).toBe('?campaign=a%26b')
  })
})
