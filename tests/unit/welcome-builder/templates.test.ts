import { HERO_ICON_NAMES } from '@/components/hero-builder/icons'
import { buildDesignCss } from '@/lib/hero-builder/css'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import type { HeroDesignV5, Widget } from '@/lib/hero-builder/types'
import { devicesMissingEntry } from '@/lib/welcome-builder/entry'
import { WELCOME_SECTION_PRESETS } from '@/lib/welcome-builder/section-presets'
import { WELCOME_TEMPLATE_CATEGORIES, WELCOME_TEMPLATES } from '@/lib/welcome-builder/templates'

import { designOf } from '../hero-builder/helpers'

const widgetsOf = (design: HeroDesignV5): Widget[] => design.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets))

function idsOf(design: HeroDesignV5): string[] {
  return [
    ...design.sections.map((s) => s.id),
    ...design.sections.flatMap((s) => s.columns.map((c) => c.id)),
    ...widgetsOf(design).flatMap((w) => {
      const c = w.content
      const nested = c.kind === 'buttons' || c.kind === 'icon-list' ? c.items.map((i) => i.id) : c.kind === 'slideshow' ? c.slides.map((s) => s.id) : []
      return [w.id, ...nested]
    }),
  ]
}

function iconsOf(design: HeroDesignV5): string[] {
  return widgetsOf(design).flatMap((w) => {
    const c = w.content
    if (c.kind === 'order-entry') return [c.ctaIcon, ...Object.values(c.icons)].filter((v): v is string => !!v)
    if (c.kind === 'badge') return c.icon ? [c.icon] : []
    if (c.kind === 'icon-list') return c.items.map((i) => i.icon)
    if (c.kind === 'buttons') return c.items.flatMap((i) => (i.icon ? [i.icon] : []))
    return []
  })
}

describe('welcome templates', () => {
  it('ships 12 templates with unique ids, filed under real categories', () => {
    expect(WELCOME_TEMPLATES).toHaveLength(12)
    expect(new Set(WELCOME_TEMPLATES.map((t) => t.id)).size).toBe(WELCOME_TEMPLATES.length)
    for (const template of WELCOME_TEMPLATES) expect(WELCOME_TEMPLATE_CATEGORIES).toContain(template.category)
    for (const category of WELCOME_TEMPLATE_CATEGORIES) expect(WELCOME_TEMPLATES.some((t) => t.category === category)).toBe(true)
  })

  it.each(WELCOME_TEMPLATES.map((t) => [t.id, t.build] as const))('%s is publishable as-is', (_id, build) => {
    const design = build()
    const parsed = heroDesignV5Schema.safeParse(design)
    expect(parsed.success ? null : parsed.error.issues[0]).toBeNull()
    // The publish action refuses a page with no way in on any device.
    expect(devicesMissingEntry(design)).toEqual([])
    expect(() => buildDesignCss(design, { scope: 'hbtpl' })).not.toThrow()
  })

  it.each(WELCOME_TEMPLATES.map((t) => [t.id, t.build] as const))('%s builds fresh ids every time', (_id, build) => {
    const first = idsOf(build())
    const second = new Set(idsOf(build()))
    expect(new Set(first).size).toBe(first.length)
    expect(first.some((id) => second.has(id))).toBe(false)
  })

  it('only uses icons the renderer knows', () => {
    for (const template of WELCOME_TEMPLATES) {
      for (const icon of iconsOf(template.build())) expect(HERO_ICON_NAMES).toContain(icon)
    }
  })

  it('greets with the store’s own name rather than placeholder copy in most templates', () => {
    const withToken = WELCOME_TEMPLATES.filter((t) => JSON.stringify(t.build()).includes('{store}'))
    expect(withToken.length).toBeGreaterThanOrEqual(8)
  })

  it('never hides a column that carries content on phones', () => {
    for (const template of WELCOME_TEMPLATES) {
      const hidden = template.build().sections.flatMap((s) => s.columns.filter((c) => c.mobile?.hidden && c.widgets.length))
      expect(hidden).toEqual([])
    }
  })
})

describe('welcome section presets', () => {
  it.each(WELCOME_SECTION_PRESETS.map((p) => [p.id, p.build] as const))('%s validates', (_id, build) => {
    expect(heroDesignV5Schema.safeParse(designOf([build()])).success).toBe(true)
  })
})
