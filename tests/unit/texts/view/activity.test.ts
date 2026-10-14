import { activityRequest, groupByDay, guestLabel, reasonText, statusesFor } from '@/lib/texts/view/activity'

const NOW = Date.parse('2026-10-14T06:10:00Z')
const lookup = (recipe: string) => (recipe === 'win_back' ? 'a-1' : null)

describe('activity', () => {
  test('filters map to server statuses', () => {
    expect(statusesFor('all')).toBeUndefined()
    expect(statusesFor('waiting')).toEqual(['queued', 'claimed'])
    expect(statusesFor('not_sent')).toEqual(['skipped', 'failed', 'cancelled', 'expired'])
  })

  test('request bodies', () => {
    expect(activityRequest({ show: 'all', from: null, cursor: null, automationIdFor: lookup }))
      .toEqual({ action: 'activity', limit: 50, includeCampaigns: true })
    expect(activityRequest({ show: 'sent', from: 'automatic', cursor: 'c', automationIdFor: lookup }))
      .toEqual({ action: 'activity', limit: 50, statuses: ['sent'], cursor: 'c' })
    expect(activityRequest({ show: 'all', from: 'auto:win_back', cursor: null, automationIdFor: lookup }))
      .toEqual({ action: 'activity', limit: 50, automationId: 'a-1' })
    expect(activityRequest({ show: 'all', from: 'campaign:x', cursor: null, automationIdFor: lookup }))
      .toMatchObject({ includeCampaigns: true, campaignId: 'x' })
  })

  test('reasons and masked guests', () => {
    expect(reasonText('campaign_paused')).toBe('You paused the campaign')
    expect(reasonText('expired')).toBe('Ran out of time: the phone didn’t send it')
    expect(reasonText('weird')).toBe('Not sent')
    expect(guestLabel('Maria Santos', '4567')).toBe('Maria S. · ending 4567')
    expect(guestLabel(null, '')).toBe('Guest · no number')
  })

  test('day groups in Manila time', () => {
    const groups = groupByDay([
      { createdAt: '2026-10-14T05:00:00Z' },
      { createdAt: '2026-10-13T20:00:00Z' },
      { createdAt: '2026-10-13T10:00:00Z' },
    ], NOW)
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([['Today', 2], ['Yesterday', 1]])
  })
})
