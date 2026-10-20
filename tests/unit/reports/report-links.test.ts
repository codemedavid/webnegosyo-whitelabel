import { reportHref } from '@/lib/reports/report-links'

const DEFAULTS = { preset: 'this_week', from: null, to: null, branch: null, compare: true } as const

describe('reportHref — every report link carries the filters', () => {
  test('defaults leave the URL bare', () => {
    expect(reportHref('/shop/admin/reports', DEFAULTS)).toBe('/shop/admin/reports')
  })

  test('the period, branch and compare state travel to the next report', () => {
    expect(
      reportHref('/shop/admin/reports/items', {
        preset: 'custom',
        from: '2026-10-01',
        to: '2026-10-07',
        branch: 'unassigned',
        compare: false,
      }),
    ).toBe('/shop/admin/reports/items?period=custom&from=2026-10-01&to=2026-10-07&branch=unassigned&compare=0')
  })

  test('page-own params (the Items view) are added after the filters', () => {
    expect(reportHref('/shop/admin/reports/items', { ...DEFAULTS, preset: 'today' }, { view: 'matrix' })).toBe(
      '/shop/admin/reports/items?period=today&view=matrix',
    )
  })

  test('an empty page param is dropped', () => {
    expect(reportHref('/shop/admin/reports/items', DEFAULTS, { view: null })).toBe('/shop/admin/reports/items')
  })
})
