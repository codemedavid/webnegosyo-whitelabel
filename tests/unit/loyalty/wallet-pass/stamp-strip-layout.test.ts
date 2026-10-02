import { buildStampStripSvgs, layoutStampStrip, STRIP_SIZE_PT } from '@/lib/loyalty/wallet-pass/stamp-strip-layout'

const COLORS = { background: '#F5D94E', foreground: '#D7392B' }

describe('layoutStampStrip', () => {
  test('ten stamps sit in two rows of five, like a paper card', () => {
    const layout = layoutStampStrip({ filled: 7, total: 10, rewardSlots: [10] }, 1)
    const rows = new Set(layout.slots.map((slot) => slot.cy))
    expect(rows.size).toBe(2)
    expect(layout.slots.filter((slot) => slot.cy === layout.slots[0].cy)).toHaveLength(5)
  })

  test('a short card is one row', () => {
    const layout = layoutStampStrip({ filled: 1, total: 4, rewardSlots: [4] }, 1)
    expect(new Set(layout.slots.map((slot) => slot.cy)).size).toBe(1)
  })

  test('marks stamped, empty and reward slots', () => {
    const layout = layoutStampStrip({ filled: 7, total: 10, rewardSlots: [5, 10] }, 1)
    expect(layout.slots.filter((slot) => slot.isFilled)).toHaveLength(7)
    expect(layout.slots.filter((slot) => slot.isReward).map((slot) => slot.index + 1)).toEqual([5, 10])
  })

  test.each([1, 3, 6, 8, 10, 12])('%i stamps fit inside the strip without overlapping', (total) => {
    for (const scale of [1, 2, 3]) {
      const layout = layoutStampStrip({ filled: 0, total, rewardSlots: [total] }, scale)
      expect(layout.width).toBe(STRIP_SIZE_PT.width * scale)
      expect(layout.height).toBe(STRIP_SIZE_PT.height * scale)
      for (const slot of layout.slots) {
        expect(slot.cx - layout.diameter / 2).toBeGreaterThanOrEqual(0)
        expect(slot.cx + layout.diameter / 2).toBeLessThanOrEqual(layout.width)
        expect(slot.cy - layout.diameter / 2).toBeGreaterThanOrEqual(0)
        expect(slot.cy + layout.diameter / 2).toBeLessThanOrEqual(layout.height)
      }
      const sameRow = layout.slots.filter((slot) => slot.cy === layout.slots[0].cy)
      for (let i = 1; i < sameRow.length; i += 1) {
        expect(sameRow[i].cx - sameRow[i - 1].cx).toBeGreaterThanOrEqual(layout.diameter)
      }
    }
  })
})

describe('buildStampStripSvgs', () => {
  const layout = layoutStampStrip({ filled: 7, total: 10, rewardSlots: [10] }, 2)

  test('paints the card colour behind the stamps', () => {
    const { base } = buildStampStripSvgs(layout, COLORS)
    expect(base).toContain('fill="#F5D94E"')
    expect(base).toContain(`width="${layout.width}"`)
  })

  test('rings every stamped slot in the card’s text colour', () => {
    const { overlay } = buildStampStripSvgs(layout, COLORS)
    expect(overlay.match(/stroke="#D7392B"/g)?.length).toBeGreaterThanOrEqual(7)
  })

  test('marks on an empty white slot use the darker brand colour so they stay visible', () => {
    const fresh = layoutStampStrip({ filled: 0, total: 6, rewardSlots: [6] }, 1)
    const { base } = buildStampStripSvgs(fresh, { background: '#335529', foreground: '#FFFFFF' })
    expect(base).toContain('stroke="#335529"')
    expect(base).not.toContain('stroke="#FFFFFF"')
  })

  test('refuses colours that are not plain hex, since they land inside SVG markup', () => {
    expect(() => buildStampStripSvgs(layout, { background: '"/><script>', foreground: '#000000' })).toThrow()
  })
})
