/** @jest-environment node */
import {
  MENU_READ_STALE_MS,
  dishesOf,
  menuReadKey,
  menuReadView,
  shouldStartMenuRead,
  usableMenuRead,
  type MenuReadRecord,
} from '@/lib/onboarding/menu-read'
import type { ParsedMenuData } from '@/types/ai-menu-parser'

const NOW = Date.parse('2026-10-09T10:00:00.000Z')
const PARSED: ParsedMenuData = {
  categories: [{ name: 'Silog' }, { name: 'Served With' }],
  items: [
    { name: 'Tapsilog', category: 'Silog', price: 159 },
    { name: 'Garlic Rice', category: 'Served With', price: 0 },
    { name: ' tapsilog ', category: 'Silog', price: 159 },
    { name: 'Sisigsilog', category: 'Silog', price: 179 },
  ],
}

const record = (patch: Partial<MenuReadRecord>): MenuReadRecord => ({
  key: 'k1', status: 'done', startedAt: new Date(NOW - 1000).toISOString(), parsed: PARSED, ...patch,
})

describe('menuReadKey', () => {
  it('changes when a photo or the typed text changes, not with stray spaces', () => {
    const base = menuReadKey(['a.jpg'], 'Adobo 150')
    expect(menuReadKey(['a.jpg'], ' Adobo 150 ')).toBe(base)
    expect(menuReadKey(['a.jpg', 'b.jpg'], 'Adobo 150')).not.toBe(base)
    expect(menuReadKey(['a.jpg'], 'Adobo 160')).not.toBe(base)
    expect(menuReadKey([], null)).toBe(menuReadKey([], ''))
  })
})

describe('shouldStartMenuRead', () => {
  it('starts for new sources, never twice for the same ones', () => {
    expect(shouldStartMenuRead(null, 'k1', NOW)).toBe(true)
    expect(shouldStartMenuRead(record({}), 'k2', NOW)).toBe(true)
    expect(shouldStartMenuRead(record({}), 'k1', NOW)).toBe(false)
    expect(shouldStartMenuRead(record({ status: 'reading' }), 'k1', NOW)).toBe(false)
    expect(shouldStartMenuRead(record({ status: 'failed' }), 'k1', NOW)).toBe(false)
  })

  it('takes over a read that died mid-way', () => {
    const dead = record({ status: 'reading', startedAt: new Date(NOW - MENU_READ_STALE_MS - 1).toISOString() })
    expect(shouldStartMenuRead(dead, 'k1', NOW)).toBe(true)
  })
})

describe('menuReadView', () => {
  it('hands the wizard tappable dishes: priced, once each', () => {
    expect(menuReadView(record({}), 'k1', NOW)).toEqual({
      status: 'done',
      dishes: [{ name: 'Tapsilog', price: 159, category: 'Silog' }, { name: 'Sisigsilog', price: 179, category: 'Silog' }],
    })
  })

  it('says idle for other sources, and failed for a read that died', () => {
    expect(menuReadView(record({}), 'other', NOW).status).toBe('idle')
    expect(menuReadView(record({ status: 'reading', startedAt: '2020-01-01T00:00:00Z' }), 'k1', NOW).status).toBe('failed')
    expect(menuReadView(record({ status: 'reading' }), 'k1', NOW)).toEqual({ status: 'reading', dishes: [] })
  })
})

describe('usableMenuRead', () => {
  it('lets the build reuse only a finished read of exactly its sources', () => {
    expect(usableMenuRead(record({}), 'k1')).toBe(PARSED)
    expect(usableMenuRead(record({}), 'k2')).toBeNull()
    expect(usableMenuRead(record({ status: 'reading' }), 'k1')).toBeNull()
    expect(usableMenuRead(record({ parsed: { categories: [], items: [] } }), 'k1')).toBeNull()
    expect(usableMenuRead(record({ parsed: null }), 'k1')).toBeNull()
  })
})

describe('dishesOf', () => {
  it('copes with nothing read', () => {
    expect(dishesOf(null)).toEqual([])
  })
})
