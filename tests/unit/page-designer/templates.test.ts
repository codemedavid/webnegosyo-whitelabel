import { LIMITS } from '@/lib/hero-builder/constants'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { PAGE_BLOCKS } from '@/lib/page-designer/blocks'
import { isPageBlockWidget } from '@/lib/page-designer/design-blocks'
import { PAGE_IDS } from '@/lib/page-designer/pages'
import { isPartKey, isValidPartValue } from '@/lib/page-designer/parts'
import { pageDesignProblem } from '@/lib/page-designer/rules'
import { block, pageParts } from '@/lib/page-designer/template-kit'
import { PAGE_TEMPLATE_CATEGORIES, PAGE_TEMPLATE_CATEGORY_LABELS, PAGE_TEMPLATES } from '@/lib/page-designer/templates'
import { TEMPLATE_FAMILIES } from '@/lib/page-designer/templates-looks'

const allTemplates = PAGE_IDS.flatMap((page) => PAGE_TEMPLATES[page].map((template) => ({ page, template })))
const cases = allTemplates.map(({ page, template }) => [`${page} / ${template.id}`, page, template] as const)

const widgetsOf = (design: HeroDesignV5) => design.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets))

/** Every part style in the design: the page's and each block's own. */
function partEntries(design: HeroDesignV5): [string, unknown][] {
  const blockParts = widgetsOf(design)
    .filter(isPageBlockWidget)
    .flatMap((w) => Object.entries(w.content.options).filter(([key]) => key.startsWith('p_')))
  return [...Object.entries(design.page?.parts ?? {}), ...blockParts]
}

describe('Page Designer templates', () => {
  it.each(PAGE_IDS)('%s: template ids are unique', (page) => {
    const ids = PAGE_TEMPLATES[page].map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(cases)('%s is publishable as-is', (_, page, template) => {
    const design = template.build()
    const parsed = heroDesignV5Schema.safeParse(design)
    expect({ ok: parsed.success, issue: parsed.success ? null : parsed.error.issues[0] }).toEqual({ ok: true, issue: null })
    expect(pageDesignProblem(design, page)).toBeNull()
    expect(JSON.stringify(design).length).toBeLessThan(LIMITS.designBytes)
    expect(PAGE_TEMPLATE_CATEGORIES).toContain(template.category)
  })

  it.each(cases)('%s: every node id is unique and every part style is valid', (_, __, template) => {
    const design = template.build()
    const ids = design.sections.flatMap((s) => [s.id, ...s.columns.flatMap((c) => [c.id, ...c.widgets.map((w) => w.id)])])
    expect(new Set(ids).size).toBe(ids.length)
    for (const [key, value] of partEntries(design)) {
      expect({ key, isPart: isPartKey(key), isValid: isValidPartValue(key, value) }).toEqual({ key, isPart: true, isValid: true })
    }
  })

  it('every checkout template holds every checkout block', () => {
    const all = PAGE_BLOCKS.checkout.map((b) => b.id).sort()
    for (const template of PAGE_TEMPLATES.checkout) {
      const present = widgetsOf(template.build()).filter(isPageBlockWidget).map((w) => w.content.block).sort()
      expect({ id: template.id, present }).toEqual({ id: template.id, present: all })
    }
  })

  it('every family template on thank-you and tracking holds every block of its page', () => {
    for (const page of ['confirmation', 'tracking'] as const) {
      const all = PAGE_BLOCKS[page].map((b) => b.id).sort()
      for (const template of PAGE_TEMPLATES[page].filter((t) => t.family)) {
        const present = widgetsOf(template.build()).filter(isPageBlockWidget).map((w) => w.content.block).sort()
        expect({ page, id: template.id, present }).toEqual({ page, id: template.id, present: all })
      }
    }
  })

  it('builds a fresh copy each time (no shared ids between picks)', () => {
    for (const { template } of allTemplates) {
      expect(template.build().sections[0]?.id).not.toBe(template.build().sections[0]?.id)
    }
  })

  it('a step-by-step or accordion design names every step and keeps Place order reachable', () => {
    for (const template of PAGE_TEMPLATES.checkout) {
      const design = template.build()
      const layout = design.page?.layout
      if (layout !== 'steps' && layout !== 'accordion') continue
      const steps = design.sections.filter((s) => s.pin !== 'bottom')
      expect(steps.length).toBeGreaterThan(1)
      for (const s of steps) expect(s.label.trim()).not.toBe('')
      // The button sits on the last step or in the pinned bar (both always reachable).
      const reachable = [...design.sections.filter((s) => s.pin === 'bottom'), steps[steps.length - 1]]
      const hasButton = reachable.some((s) => s.columns.some((c) => c.widgets.some((w) => isPageBlockWidget(w) && w.content.block === 'checkout.place_order')))
      expect({ id: template.id, hasButton }).toEqual({ id: template.id, hasButton: true })
    }
  })

  it('every family has exactly one template on each page', () => {
    for (const family of TEMPLATE_FAMILIES) {
      for (const page of PAGE_IDS) {
        expect({ family, page, count: PAGE_TEMPLATES[page].filter((t) => t.family === family).length }).toEqual({ family, page, count: 1 })
      }
    }
  })

  it('labels every gallery category', () => {
    for (const category of PAGE_TEMPLATE_CATEGORIES) expect(PAGE_TEMPLATE_CATEGORY_LABELS[category]).toBeTruthy()
  })

  it('templates never fix brand colours on block parts beyond the listed neutrals', () => {
    const NEUTRALS = new Set(['#111111', '#fffdf7', '#1c1917', '#57534e', '#a8a29e', '#00000000'])
    for (const { template } of allTemplates) {
      for (const [key, value] of partEntries(template.build())) {
        if (typeof value === 'string' && value.startsWith('#')) expect({ id: template.id, key, value, ok: NEUTRALS.has(value) }).toEqual({ id: template.id, key, value, ok: true })
      }
    }
  })
})

describe('template kit', () => {
  it('refuses settings, wording and part values a block cannot use', () => {
    expect(() => block('checkout', 'checkout.payment', { options: { variant: 'nope' } })).toThrow(/invalid variant/)
    expect(() => block('checkout', 'checkout.payment', { options: { nope: true } })).toThrow(/no setting/)
    expect(() => block('checkout', 'checkout.payment', { texts: { title: 'x'.repeat(49) } })).toThrow(/longer than/)
    expect(() => block('checkout', 'checkout.payment', { parts: { p_card_radius: 'huge' } })).toThrow(/Invalid part style/)
    expect(() => block('checkout', 'tracking.status')).toThrow(/Unknown checkout block/)
    expect(() => pageParts({ p_title_color: 'red' })).toThrow(/Invalid part style/)
  })

  it('keeps registry options and the part styles a block draws, and drops parts it does not', () => {
    const widget = block('checkout', 'checkout.place_order', { options: { size: 'large' }, parts: { p_button_radius: 'pill', p_option_radius: 'lg' } })
    expect(widget.content.kind === 'page-block' && widget.content.options).toMatchObject({ size: 'large', p_button_radius: 'pill' })
    expect(widget.content.kind === 'page-block' && widget.content.options.p_option_radius).toBeUndefined()
  })
})
