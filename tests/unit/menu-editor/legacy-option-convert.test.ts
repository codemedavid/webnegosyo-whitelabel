import { sizesToChoiceGroup, withExclusiveDefault, SIZE_GROUP_NAME } from '@/lib/menu-editor/legacy-option-convert'
import type { Variation } from '@/types/database'

const sizes: Variation[] = [
  { id: 's', name: 'Small', price_modifier: 0, is_default: true },
  { id: 'l', name: 'Large', price_modifier: 20 },
]

describe('sizesToChoiceGroup', () => {
  it('carries every size into one required "Size" choice, in order', () => {
    const group = sizesToChoiceGroup(sizes, 'grp-1')

    expect(group).toEqual({
      id: 'grp-1',
      name: SIZE_GROUP_NAME,
      is_required: true,
      display_order: 0,
      options: [
        { id: 's', name: 'Small', price_modifier: 0, is_default: true, display_order: 0 },
        { id: 'l', name: 'Large', price_modifier: 20, is_default: false, display_order: 1 },
      ],
    })
  })

  it('does not mutate the size list it was given', () => {
    const before = JSON.stringify(sizes)
    sizesToChoiceGroup(sizes, 'grp-1')
    expect(JSON.stringify(sizes)).toBe(before)
  })
})

describe('withExclusiveDefault', () => {
  it('makes the tapped option the only default', () => {
    const next = withExclusiveDefault(sizes, 1)
    expect(next.map((s) => s.is_default)).toEqual([false, true])
  })

  it('clears the default when the current default is tapped again', () => {
    const next = withExclusiveDefault(sizes, 0)
    expect(next.map((s) => s.is_default)).toEqual([false, false])
  })

  it('returns new objects instead of editing the originals', () => {
    const next = withExclusiveDefault(sizes, 1)
    expect(next[1]).not.toBe(sizes[1])
    expect(sizes[1].is_default).toBeUndefined()
  })
})
