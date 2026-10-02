import { sectionForIndex } from './scroll-spy'

describe('sectionForIndex', () => {
  const headers = [0, 4, 9]

  it('returns the section whose header is at or above the first visible row', () => {
    expect(sectionForIndex(0, headers)).toBe(0)
    expect(sectionForIndex(3, headers)).toBe(0)
    expect(sectionForIndex(4, headers)).toBe(1)
    expect(sectionForIndex(20, headers)).toBe(2)
  })

  it('defaults to the first section before any header or with none', () => {
    expect(sectionForIndex(-1, headers)).toBe(0)
    expect(sectionForIndex(5, [])).toBe(0)
  })
})
