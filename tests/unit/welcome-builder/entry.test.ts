import { createWidget } from '@/lib/hero-builder/defaults'
import { resolveEntryLayout } from '@/lib/hero-builder/entry-copy'
import type { Widget } from '@/lib/hero-builder/types'
import { devicesMissingEntry, entryProblem, isEntryWidget, withGuaranteedEntry } from '@/lib/welcome-builder/entry'

import { column, deepFreeze, designOf, section } from '../hero-builder/helpers'

function buttonTo(href: string): Widget {
  const base = createWidget('buttons')
  return { ...base, content: { kind: 'buttons', items: [{ id: 'b1', label: 'Go', href, newTab: false, variant: 'solid' }] } }
}

const heading = (): Widget => createWidget('heading')

describe('isEntryWidget — what counts as a way in', () => {
  it('counts the How to order block', () => {
    expect(isEntryWidget(createWidget('order-entry'))).toBe(true)
  })

  it.each(['#welcome-start', '#welcome-mode-pickup', '#storefront-menu', '#category-abc', '#product-xyz'])(
    'counts a button linking to %s',
    (href) => {
      expect(isEntryWidget(buttonTo(href))).toBe(true)
    },
  )

  it('does not count a button to a web address, a section, or a bogus order type', () => {
    expect(isEntryWidget(buttonTo('https://facebook.com/store'))).toBe(false)
    expect(isEntryWidget(buttonTo('#promo'))).toBe(false)
    expect(isEntryWidget(buttonTo('#welcome-mode-teleport'))).toBe(false)
  })

  it('counts a linked image or slide, but not an unlinked one', () => {
    const image = createWidget('image')
    expect(isEntryWidget({ ...image, content: { kind: 'image', src: 'https://x.test/a.jpg', alt: '', href: '#welcome-start' } })).toBe(true)
    expect(isEntryWidget(image)).toBe(false)
    const show = createWidget('slideshow')
    const slides = [{ id: 's1', src: 'https://x.test/a.jpg', alt: '', href: '#welcome-start' }]
    expect(isEntryWidget({ ...show, content: { ...(show.content as Extract<Widget['content'], { kind: 'slideshow' }>), slides } })).toBe(true)
    expect(isEntryWidget(show)).toBe(false)
  })

  it('does not count headings and text', () => {
    expect(isEntryWidget(heading())).toBe(false)
  })
})

describe('devicesMissingEntry / entryProblem', () => {
  it('passes a design with a visible entry everywhere', () => {
    const design = designOf([section('s', [column('c', [createWidget('order-entry')])])])
    expect(devicesMissingEntry(design)).toEqual([])
    expect(entryProblem(design)).toBeNull()
  })

  it('flags every device when there is no entry at all', () => {
    const design = designOf([section('s', [column('c', [heading()])])])
    expect(devicesMissingEntry(design)).toEqual(['desktop', 'tablet', 'mobile'])
    expect(entryProblem(design)).toMatch(/How to order/)
    expect(entryProblem(design)).not.toMatch(/ on /)
  })

  it('names phones when the only entry is hidden on mobile', () => {
    const entry = { ...createWidget('order-entry'), mobile: { hidden: true } }
    const design = designOf([section('s', [column('c', [entry])])])
    expect(devicesMissingEntry(design)).toEqual(['mobile'])
    expect(entryProblem(design)).toMatch(/on phones/)
  })

  it('treats a hidden section or column as hiding its entry', () => {
    const hiddenSection = designOf([section('s', [column('c', [createWidget('order-entry')])], { tablet: { hidden: true } })])
    expect(devicesMissingEntry(hiddenSection)).toEqual(['tablet', 'mobile'])
    const hiddenColumn = designOf([section('s', [{ ...column('c', [createWidget('order-entry')]), style: { width: 100, hidden: true } }])])
    expect(devicesMissingEntry(hiddenColumn)).toEqual(['desktop', 'tablet', 'mobile'])
  })
})

describe('withGuaranteedEntry — a customer is never trapped', () => {
  it('returns the same design when every device already has a way in', () => {
    const design = deepFreeze(designOf([section('s', [column('c', [createWidget('order-entry')])])]))
    expect(withGuaranteedEntry(design)).toBe(design)
  })

  it('appends a start button without touching the stored design', () => {
    const design = deepFreeze(designOf([section('s', [column('c', [heading()])])]))
    const guarded = withGuaranteedEntry(design)
    expect(guarded.sections).toHaveLength(2)
    expect(design.sections).toHaveLength(1)
    const fallback = guarded.sections[1].columns[0].widgets[0]
    expect(fallback.content).toMatchObject({ kind: 'order-entry', layout: 'cta' })
    expect(devicesMissingEntry(guarded)).toEqual([])
  })

  it('shows the fallback only on the devices that lacked an entry', () => {
    const entry = { ...createWidget('order-entry'), mobile: { hidden: true } }
    const guarded = withGuaranteedEntry(designOf([section('s', [column('c', [entry])])]))
    const fallback = guarded.sections[1]
    expect(fallback.style.hidden).toBe(true)
    expect(fallback.tablet?.hidden).toBe(true)
    expect(fallback.mobile?.hidden).toBe(false)
  })

  it('keeps stable ids so React keys do not churn between renders', () => {
    const design = designOf([section('s', [column('c', [heading()])])])
    expect(withGuaranteedEntry(design).sections[1].id).toBe(withGuaranteedEntry(design).sections[1].id)
  })
})

describe('the How to order block is always a working way in', () => {
  // `isEntryWidget` certifies every order-entry block as an entry. That is only
  // true because the block degrades to the start button when nothing can be
  // offered — pin the two together so neither can drift on its own.
  it.each(['tiles', 'list', 'cta'] as const)('a %s block with no order type on offer becomes the start button', (layout) => {
    expect(isEntryWidget({ ...createWidget('order-entry'), content: { ...(createWidget('order-entry').content as Extract<Widget['content'], { kind: 'order-entry' }>), layout } })).toBe(true)
    expect(resolveEntryLayout({ layout }, 0)).toBe('cta')
  })

  it.each([1, 2, 3])('offers %i choice(s) as tiles or a list, never nothing', (count) => {
    expect(['tiles', 'list']).toContain(resolveEntryLayout({ layout: 'tiles' }, count))
    expect(['tiles', 'list']).toContain(resolveEntryLayout({ layout: 'list' }, count))
  })

  it('treats an unknown stored layout as tiles, which still degrades to the button', () => {
    expect(resolveEntryLayout({ layout: 'carousel' as never }, 2)).toBe('tiles')
    expect(resolveEntryLayout({ layout: 'carousel' as never }, 0)).toBe('cta')
  })
})
