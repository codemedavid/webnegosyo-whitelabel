/**
 * Block knobs: designs, colours and images ride in the block's options. A
 * stored design is untrusted, so anything invalid reads as the default on
 * the storefront and is refused on publish.
 */

import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import { pageBlockDef, PAGE_BLOCKS } from '@/lib/page-designer/blocks'
import { colorKnob, cornersClass, designKnob, isValidOptionValue, optionGroup } from '@/lib/page-designer/knobs'
import { pageDesignProblem } from '@/lib/page-designer/rules'
import { resolveBlockOption } from '@/lib/page-designer/text'
import type { HeroDesignV5, PageBlockContent } from '@/lib/hero-builder/types'
import type { BlockOption, PageBlockDef } from '@/lib/page-designer/types'

const DESIGN = designKnob([
  { value: 'tiles', label: 'Tiles' },
  { value: 'list', label: 'List' },
])
const ACCENT = colorKnob('color_accent', 'Selected colour', 'Accent')
const IMAGE: BlockOption = { key: 'image_pickup', label: 'Pickup photo', type: 'image', default: '' }

const DEF: PageBlockDef = {
  id: 'checkout.test',
  page: 'checkout',
  label: 'Test',
  description: '',
  icon: 'Box',
  required: false,
  texts: [],
  options: [DESIGN, ACCENT, IMAGE],
}

/** The standard checkout with one block's options replaced. */
function withOptions(blockId: string, options: Record<string, unknown>): HeroDesignV5 {
  const design = createStandardDesign('checkout')
  return {
    ...design,
    sections: design.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets.map((w) => {
          const content = w.content as PageBlockContent
          return w.kind === 'page-block' && content.block === blockId ? { ...w, content: { ...content, options } } : w
        }),
      })),
    })),
  } as HeroDesignV5
}

describe('block option values', () => {
  it('accepts a design the block offers and refuses any other', () => {
    expect(isValidOptionValue(DESIGN, 'list')).toBe(true)
    expect(isValidOptionValue(DESIGN, 'carousel')).toBe(false)
    expect(isValidOptionValue(DESIGN, true)).toBe(false)
  })

  it('takes hex colours or blank (= follow the page colours) only', () => {
    expect(isValidOptionValue(ACCENT, '')).toBe(true)
    expect(isValidOptionValue(ACCENT, '#ff6600')).toBe(true)
    expect(isValidOptionValue(ACCENT, '#f60')).toBe(true)
    expect(isValidOptionValue(ACCENT, 'red')).toBe(false)
    expect(isValidOptionValue(ACCENT, 'url(javascript:alert(1))')).toBe(false)
    expect(isValidOptionValue(ACCENT, '#ff6600;background:red')).toBe(false)
  })

  it('takes https image URLs only', () => {
    expect(isValidOptionValue(IMAGE, 'https://ik.imagekit.io/x/a.jpg')).toBe(true)
    expect(isValidOptionValue(IMAGE, '')).toBe(true)
    expect(isValidOptionValue(IMAGE, 'http://example.com/a.jpg')).toBe(false)
    expect(isValidOptionValue(IMAGE, 'javascript:alert(1)')).toBe(false)
    expect(isValidOptionValue(IMAGE, `https://example.com/${'a'.repeat(700)}`)).toBe(false)
  })

  it('reads an invalid stored value as the default, so the block keeps its original look', () => {
    expect(resolveBlockOption(DEF, 'variant', { variant: 'carousel' })).toBe('tiles')
    expect(resolveBlockOption(DEF, 'color_accent', { color_accent: 'red' })).toBe('')
    expect(resolveBlockOption(DEF, 'image_pickup', { image_pickup: 'javascript:x' })).toBe('')
    expect(resolveBlockOption(DEF, 'variant', {})).toBe('tiles')
    expect(resolveBlockOption(DEF, 'color_accent', { color_accent: '#123456' })).toBe('#123456')
  })

  it('groups designs first, colours next, everything else under the switches', () => {
    expect(optionGroup(DESIGN)).toBe('design')
    expect(optionGroup(ACCENT)).toBe('colors')
    expect(optionGroup(IMAGE)).toBe('options')
  })

  it('maps corner choices to radius classes and keeps the block’s own for auto', () => {
    expect(cornersClass('auto', 'rounded-2xl')).toBe('rounded-2xl')
    expect(cornersClass(undefined, 'rounded-2xl')).toBe('rounded-2xl')
    expect(cornersClass('square', 'rounded-2xl')).toBe('rounded-none')
    expect(cornersClass('round', 'rounded-2xl')).toBe('rounded-3xl')
  })
})

describe('publishing block knobs', () => {
  it('refuses an unknown design on the order type block', () => {
    const problem = pageDesignProblem(withOptions('checkout.order_type', { variant: 'carousel' }), 'checkout')
    expect(problem).toMatch(/Order type/)
  })

  it('refuses a colour that is not a hex', () => {
    const problem = pageDesignProblem(withOptions('checkout.order_type', { color_accent: 'red;x' }), 'checkout')
    expect(problem).toMatch(/invalid value/)
  })

  it('publishes a valid design and colour', () => {
    expect(pageDesignProblem(withOptions('checkout.order_type', { variant: 'list', color_accent: '#0f766e' }), 'checkout')).toBeNull()
  })
})

describe('every registered knob', () => {
  const all = Object.values(PAGE_BLOCKS).flat()

  it('starts every design gallery with a valid default (the original look)', () => {
    for (const def of all) {
      for (const option of def.options) {
        if (option.type === 'choice') expect(option.choices.map((c) => c.value)).toContain(option.default)
        if (option.type === 'color' || option.type === 'image') expect(option.default).toBe('')
      }
    }
  })

  it('uses option keys the design schema accepts, each once per block, at most 24 per block', () => {
    for (const def of all) {
      const keys = def.options.map((o) => o.key)
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys.length).toBeLessThanOrEqual(24)
      for (const key of keys) expect(key).toMatch(/^[a-z0-9_]{1,40}$/)
    }
  })

  it('points every showWhen at an option of the same block', () => {
    for (const def of all) {
      for (const option of def.options) {
        if (!option.showWhen) continue
        expect(pageBlockDef(def.page, def.id)?.options.some((o) => o.key === option.showWhen?.key)).toBe(true)
      }
    }
  })

  it('names colour knobs color_* and has them follow a page colour', () => {
    for (const def of all) {
      for (const option of def.options) {
        if (option.type !== 'color') continue
        expect(option.key).toMatch(/^color_/)
        expect(option.follows.length).toBeGreaterThan(0)
      }
    }
  })
})
