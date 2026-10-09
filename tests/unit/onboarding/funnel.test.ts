import { buildFunnelReport, type FunnelSetup } from '@/lib/onboarding/funnel'

const NOW = Date.parse('2026-10-09T12:00:00Z')
const setup = (id: string, events: Record<string, string>, firstOrderAt: string | null = null): FunnelSetup => ({
  id, businessName: `Store ${id}`, createdAt: '2026-10-01T00:00:00Z', events: new Map(Object.entries(events)), firstOrderAt,
})

describe('buildFunnelReport', () => {
  const setups = [
    setup('a', { opened: '2026-10-08T00:00:00Z', 'screen:channels': '2026-10-08T00:01:00Z' }),
    setup('b', { opened: '2026-10-09T11:00:00Z' }),
    setup('c', { opened: '2026-10-05T00:00:00Z', submitted: '2026-10-05T00:10:00Z', live: '2026-10-05T00:12:00Z', shared: '2026-10-05T00:13:00Z' }, '2026-10-05T06:12:00Z'),
    setup('d', { submitted: '2026-10-06T00:00:00Z', live: '2026-10-06T00:02:00Z' }, '2026-10-06T10:02:00Z'),
    setup('e', {}),
  ]
  const report = buildFunnelReport(setups, NOW)
  const count = (id: string) => report.stages.find((stage) => stage.id === id)?.count

  it('counts each stage, treating a later milestone as passing the earlier screens', () => {
    expect(count('opened')).toBe(4)
    expect(count('goals')).toBe(3)
    expect(count('submitted')).toBe(2)
    expect(count('live')).toBe(2)
    expect(count('shared')).toBe(1)
    expect(count('first_order')).toBe(2)
    expect(report.stages[0].share).toBe(1)
  })

  it('reports the median time from opening to the first order', () => {
    expect(report.medianHoursToFirstOrder).toBe(8)
  })

  it('lists set-ups that went quiet before opening, most recent first, with where they stopped', () => {
    expect(report.stalled.map((row) => [row.id, row.stage])).toEqual([
      ['a', 'Picked their goals'],
      ['e', 'Not opened yet'],
    ])
    expect(report.stalled.find((row) => row.id === 'b')).toBeUndefined()
  })
})
