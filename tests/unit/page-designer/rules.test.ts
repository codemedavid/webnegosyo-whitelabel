import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import { loadHeroDesign } from '@/lib/hero-builder/load'
import { removeNode } from '@/lib/hero-builder/tree-ops'
import type { HeroDesignV5, Widget } from '@/lib/hero-builder/types'
import { blockDef, PAGE_BLOCKS, requiredBlocks, STANDARD_ORDER } from '@/lib/page-designer/blocks'
import { blockIdsIn, canDuplicateNode, canRemoveNode, createPageBlock, removeBlockedReason } from '@/lib/page-designer/design-blocks'
import { PAGE_IDS, PAGE_META, pageBySlug } from '@/lib/page-designer/pages'
import { missingRequiredBlocks, pageDesignProblem, preparePageDesign } from '@/lib/page-designer/rules'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import type { PageId } from '@/lib/page-designer/types'

import { column, deepFreeze, designOf, section } from '../hero-builder/helpers'

const block = (id: string, extra: Partial<Widget> = {}): Widget => ({ ...createPageBlock(blockDef(id)!), id: `w-${id}`, ...extra })
const text = (id: string): Widget => ({ id, kind: 'text', content: { kind: 'text', text: 'Hello' }, style: {} })

function trackingDesign(widgets: Widget[]): HeroDesignV5 {
  return designOf([section('s1', [column('c1', widgets)])])
}

describe('page block registry', () => {
  it('names every block <page>.<name>, uniquely, on its own page', () => {
    const ids = PAGE_IDS.flatMap((page) => PAGE_BLOCKS[page].map((b) => b.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const page of PAGE_IDS) {
      for (const def of PAGE_BLOCKS[page]) {
        expect(def.page).toBe(page)
        expect(def.id.startsWith(`${page}.`)).toBe(true)
        expect(def.id).toMatch(/^[a-z0-9._-]{1,64}$/)
        for (const slot of def.texts) {
          expect(slot.key).toMatch(/^[a-z0-9_]{1,40}$/)
          expect(slot.fallback.length).toBeLessThanOrEqual(slot.maxLength)
        }
      }
    }
  })

  it('lists every block of a page exactly once in its standard order', () => {
    for (const page of PAGE_IDS) {
      expect([...STANDARD_ORDER[page]].sort()).toEqual(PAGE_BLOCKS[page].map((b) => b.id).sort())
    }
  })

  it('gives every page at least one required block', () => {
    for (const page of PAGE_IDS) expect(requiredBlocks(page).length).toBeGreaterThan(0)
  })

  it('maps admin slugs back to pages', () => {
    for (const page of PAGE_IDS) expect(pageBySlug(PAGE_META[page].slug)).toBe(page)
    expect(pageBySlug('constructor')).toBeNull()
  })

  it('never offers embed on any page, nor custom HTML on checkout', () => {
    for (const page of PAGE_IDS) expect(PAGE_META[page].freeKinds).not.toContain('embed')
    expect(PAGE_META.checkout.freeKinds).not.toContain('html')
  })
})

describe('standard designs', () => {
  it.each(PAGE_IDS)('%s: passes the schema and the page rules as-is', (page: PageId) => {
    const design = createStandardDesign(page)
    expect(heroDesignV5Schema.safeParse(design).success).toBe(true)
    expect(pageDesignProblem(design, page)).toBeNull()
    expect(blockIdsIn(design)).toEqual(STANDARD_ORDER[page])
  })

  it('survives a save/load round trip with its blocks intact', () => {
    const design = createStandardDesign('checkout')
    expect(loadHeroDesign(JSON.stringify(design))).toEqual(design)
  })
})

describe('locks', () => {
  const design = deepFreeze(trackingDesign([block('tracking.status'), block('tracking.summary'), text('t1')]))

  it('refuses to remove a required block or anything holding one', () => {
    expect(canRemoveNode(design, 'w-tracking.status')).toBe(false)
    expect(canRemoveNode(design, 'c1')).toBe(false)
    expect(canRemoveNode(design, 's1')).toBe(false)
    expect(removeBlockedReason(design, 'w-tracking.status')).toMatch(/can't be removed/)
  })

  it('lets optional blocks and free widgets go', () => {
    expect(canRemoveNode(design, 'w-tracking.summary')).toBe(true)
    expect(canRemoveNode(design, 't1')).toBe(true)
    expect(removeBlockedReason(design, 't1')).toBeNull()
  })

  it('never duplicates a page block, but duplicates free widgets', () => {
    expect(canDuplicateNode(design, 'w-tracking.summary')).toBe(false)
    expect(canDuplicateNode(design, 's1')).toBe(false)
    expect(canDuplicateNode(design, 't1')).toBe(true)
  })
})

describe('pageDesignProblem', () => {
  it('refuses a design without a required block', () => {
    expect(pageDesignProblem(trackingDesign([text('t1')]), 'tracking')).toMatch(/"Order status" must show/)
  })

  it('names the devices where a required block is hidden', () => {
    const design = trackingDesign([block('tracking.status', { mobile: { hidden: true } })])
    expect(pageDesignProblem(design, 'tracking')).toMatch(/on phones/)
  })

  it('refuses a required block limited by "Show when"', () => {
    const design = trackingDesign([block('tracking.status', { showWhen: ['preparing'] })])
    expect(pageDesignProblem(design, 'tracking')).toMatch(/must show/)
  })

  it('refuses another page’s block, duplicates, unknown text keys and over-long text', () => {
    expect(pageDesignProblem(trackingDesign([block('tracking.status'), block('checkout.payment')]), 'tracking')).toMatch(/another page/)
    const twice = trackingDesign([block('tracking.status'), { ...block('tracking.status'), id: 'again' }])
    expect(pageDesignProblem(twice, 'tracking')).toMatch(/appears twice/)
    const unknownKey = block('tracking.status')
    ;(unknownKey.content as { texts: Record<string, string> }).texts = { nope: 'x' }
    expect(pageDesignProblem(trackingDesign([unknownKey]), 'tracking')).toMatch(/doesn't use/)
    const long = block('tracking.status')
    ;(long.content as { texts: Record<string, string> }).texts = { greeting: 'x'.repeat(81) }
    expect(pageDesignProblem(trackingDesign([long]), 'tracking')).toMatch(/too long/)
  })

  it('refuses elements the page does not offer', () => {
    const embed: Widget = { id: 'e', kind: 'embed', content: { kind: 'embed', code: '<b>x</b>', height: 200, autoHeight: true }, style: {} }
    expect(pageDesignProblem(trackingDesign([block('tracking.status'), embed]), 'tracking')).toMatch(/can't use that element/)
    const html: Widget = { id: 'h', kind: 'html', content: { kind: 'html', html: '<b>x</b>' }, style: {} }
    expect(pageDesignProblem(trackingDesign([block('tracking.status'), html]), 'tracking')).toBeNull()
    const checkout = createStandardDesign('checkout')
    const withHtml = { ...checkout, sections: [...checkout.sections, section('s2', [column('c2', [html])])] }
    expect(pageDesignProblem(withHtml, 'checkout')).toMatch(/can't use that element/)
  })
})

describe('preparePageDesign', () => {
  it('appends a missing required block, shown on every device', () => {
    const prepared = preparePageDesign(trackingDesign([text('t1')]), 'tracking')
    expect(blockIdsIn(prepared)).toEqual(['tracking.status'])
    expect(missingRequiredBlocks(prepared, 'tracking').size).toBe(0)
  })

  it('adds a fallback only on the device where the block is hidden', () => {
    const design = trackingDesign([block('tracking.status', { mobile: { hidden: true } })])
    const prepared = preparePageDesign(design, 'tracking')
    const fallback = prepared.sections.at(-1)!
    expect(fallback.style.hidden).toBe(true)
    expect(fallback.mobile?.hidden).toBe(false)
    expect(missingRequiredBlocks(prepared, 'tracking').size).toBe(0)
  })

  it('drops other pages’ blocks, duplicates and disallowed kinds without touching the input', () => {
    const embed: Widget = { id: 'e', kind: 'embed', content: { kind: 'embed', code: 'x', height: 200, autoHeight: true }, style: {} }
    const design = deepFreeze(
      trackingDesign([block('tracking.status'), { ...block('tracking.status'), id: 'dupe' }, block('checkout.payment'), embed, text('t1')]),
    )
    const prepared = preparePageDesign(design, 'tracking')
    expect(prepared.sections[0].columns[0].widgets.map((w) => w.id)).toEqual(['w-tracking.status', 't1'])
  })

  it('keeps a complete design unchanged in shape', () => {
    const design = createStandardDesign('confirmation')
    expect(preparePageDesign(design, 'confirmation').sections).toHaveLength(1)
  })

  it('removing via tree-ops still works for free widgets (the lock lives in the editor policy)', () => {
    const design = trackingDesign([block('tracking.status'), text('t1')])
    expect(blockIdsIn(removeNode(design, 't1'))).toEqual(['tracking.status'])
  })
})
