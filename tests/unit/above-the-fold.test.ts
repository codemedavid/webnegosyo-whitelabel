/**
 * The fold rule, and proof that every menu layout applies it.
 *
 * Lighthouse pinned SeaCook's 8s LCP on the first card image, which was
 * `loading="lazy"` like every other. The grid got a fix; the storefront was
 * not using the grid — SeaCook draws through the mosaic layout, which maps
 * cards itself, as do grid-focus and magazine. One helper decides which cards
 * sit above the fold, and a scan proves each layout asks it.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { globSync } from 'glob'
import { ABOVE_THE_FOLD_CARD_COUNT, isAboveTheFold, pageIndexOf } from '@/lib/above-the-fold'

describe('isAboveTheFold', () => {
  it('is true for the first ABOVE_THE_FOLD_CARD_COUNT cards only', () => {
    expect(isAboveTheFold(0)).toBe(true)
    expect(isAboveTheFold(ABOVE_THE_FOLD_CARD_COUNT - 1)).toBe(true)
    expect(isAboveTheFold(ABOVE_THE_FOLD_CARD_COUNT)).toBe(false)
  })
})

describe('pageIndexOf', () => {
  const groups = [{ items: ['a', 'b'] }, { items: ['c'] }, { items: ['d', 'e'] }]

  it('counts cards in page order across group boundaries', () => {
    expect(pageIndexOf(groups, 0, 1)).toBe(1)
    expect(pageIndexOf(groups, 1, 0)).toBe(2)
    expect(pageIndexOf(groups, 2, 1)).toBe(4)
  })
})

describe('menu layouts', () => {
  const layoutsDir = join(process.cwd(), 'src', 'components', 'customer', 'layouts')
  const layoutFiles = globSync('layout-*.tsx', { cwd: layoutsDir, absolute: true })

  it.each(layoutFiles.map((file) => [file.split('/').pop(), file]))(
    '%s passes priority to every card it maps',
    (_name, file) => {
      const source = readFileSync(file as string, 'utf8')
      const cards = source.match(/<MenuItemCard[\s\S]*?\/>/g) ?? []
      const withoutPriority = cards.filter((card) => !/\bpriority=/.test(card))
      expect(withoutPriority).toEqual([])
    },
  )
})
