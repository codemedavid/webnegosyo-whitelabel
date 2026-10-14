import type { CampaignListItem } from '@/lib/texts/types'
import {
  actionLabel,
  cameBackCell,
  campaignActions,
  filterCampaigns,
  filterCounts,
  opensInEditor,
  peso,
  sentCell,
  sortCampaigns,
  whoCell,
} from '@/lib/texts/view/campaigns'

function item(overrides: Partial<CampaignListItem>): CampaignListItem {
  return {
    id: 'c', name: 'C', messageTemplate: 'Hi', messagePreview: 'Hi', audience: {}, audiencePreset: 'everyone',
    audienceLabel: 'Everyone', schedule: { kind: 'one_off', time: '10:00', date: '2026-10-16', intervalDays: null, weekdays: [], endsOn: null },
    status: 'draft', delivery: 'server', displayState: 'draft', pauseReason: null, whenLabel: '—', nextSendAt: null,
    progress: null, results: null, isEditable: true, updatedAt: '2026-10-10T00:00:00Z', createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('campaign list', () => {
  const list = [
    item({ id: 'done', displayState: 'sent', createdAt: '2026-10-02T00:00:00Z' }),
    item({ id: 'draft', displayState: 'draft' }),
    item({ id: 'sending', displayState: 'sending' }),
    item({ id: 'later', displayState: 'scheduled', nextSendAt: '2026-10-20T02:00:00Z' }),
    item({ id: 'soon', displayState: 'repeating', nextSendAt: '2026-10-16T02:00:00Z' }),
    item({ id: 'waiting', displayState: 'waiting_for_phone' }),
    item({ id: 'paused', displayState: 'paused' }),
    item({ id: 'old', displayState: 'archived' }),
  ]

  test('sort: sending, waiting, upcoming by start, paused, drafts, done', () => {
    expect(sortCampaigns(list).map((c) => c.id)).toEqual(['sending', 'waiting', 'soon', 'later', 'paused', 'draft', 'done', 'old'])
  })

  test('filters', () => {
    expect(filterCampaigns(list, 'active').map((c) => c.id).sort()).toEqual(['later', 'paused', 'sending', 'soon', 'waiting'])
    expect(filterCampaigns(list, 'drafts').map((c) => c.id)).toEqual(['draft'])
    expect(filterCampaigns(list, 'done').map((c) => c.id)).toEqual(['done'])
    expect(filterCampaigns(list, 'all').some((c) => c.id === 'old')).toBe(false)
    expect(filterCampaigns(list, 'archived').map((c) => c.id)).toEqual(['old'])
    expect(filterCounts(list).archived).toBe(1)
  })

  test('row actions follow the status table', () => {
    expect(campaignActions(item({ displayState: 'draft' }))).toEqual(['edit', 'duplicate', 'delete'])
    expect(campaignActions(item({ displayState: 'scheduled' }))).toEqual(['edit', 'pause', 'duplicate'])
    expect(campaignActions(item({ displayState: 'repeating' }))).toEqual(['edit', 'pause', 'duplicate'])
    expect(campaignActions(item({ displayState: 'sending' }))).toEqual(['view', 'pause', 'duplicate'])
    expect(campaignActions(item({ displayState: 'paused', isEditable: false }))).toEqual(['resume', 'duplicate', 'archive'])
    expect(campaignActions(item({ displayState: 'paused' }))).toEqual(['resume', 'edit', 'duplicate', 'archive'])
    expect(campaignActions(item({ displayState: 'sent' }))).toEqual(['view', 'duplicate', 'archive'])
    expect(campaignActions(item({ displayState: 'archived' }))).toEqual(['view', 'duplicate', 'unarchive'])
    expect(campaignActions(item({ displayState: 'app_managed' }))).toEqual(['view', 'switch_to_automatic', 'duplicate', 'archive'])
    expect(actionLabel('switch_to_automatic', item({}))).toBe('Let it send by itself')
    expect(campaignActions(item({ displayState: 'scheduled', isEditable: false }))).toEqual(['pause', 'duplicate'])
  })

  test('drafts and untouched scheduled campaigns open in the editor', () => {
    expect(opensInEditor(item({ displayState: 'draft' }))).toBe(true)
    expect(opensInEditor(item({ displayState: 'scheduled' }))).toBe(true)
    expect(opensInEditor(item({ displayState: 'scheduled', results: { sent: 3, notSent: 0, cameBack: 0, sales: 0, isFinal: false, finalOn: null, isApproximate: false } }))).toBe(false)
    expect(opensInEditor(item({ displayState: 'sent' }))).toBe(false)
  })

  test('cells', () => {
    const results = { sent: 148, notSent: 2, cameBack: 18, sales: 6420, isFinal: true, finalOn: null, isApproximate: false }
    expect(sentCell(item({ results }), null)).toBe('148')
    expect(sentCell(item({}), { runId: 'r', sent: 64, notSent: 0, waiting: 148, total: 212, finishAt: null, isQuietNow: false, isWaitingForPhone: false })).toBe('64 / 212')
    expect(sentCell(item({}), null)).toBe('—')
    expect(cameBackCell(item({ results }))).toBe('18 · ₱6,420')
    expect(cameBackCell(item({}))).toBe('—')
    expect(peso(9860)).toBe('₱9,860')
    expect(whoCell(item({ audienceLabel: 'Regulars', results }), null)).toBe('Regulars · 150')
    expect(whoCell(item({ audienceLabel: 'Regulars' }), null)).toBe('Regulars')
  })
})
