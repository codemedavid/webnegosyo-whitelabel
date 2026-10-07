import { HERO_ICON_NAMES } from '@/components/hero-builder/icons'
import { buildDesignCss } from '@/lib/hero-builder/css'
import { createBlankDesign } from '@/lib/hero-builder/defaults'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import { SECTION_PRESETS } from '@/lib/hero-builder/section-presets'
import { HERO_TEMPLATE_CATEGORIES, HERO_TEMPLATES } from '@/lib/hero-builder/templates'
import type { HeroDesignV5, Section, Widget } from '@/lib/hero-builder/types'

function designOfPreset(section: Section): HeroDesignV5 {
  return { version: 5, theme: createBlankDesign().theme, sections: [section] }
}

function widgetsOf(design: HeroDesignV5): Widget[] {
  return design.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets))
}

/** Every id in a design: sections, columns, widgets and their list items. */
function idsOf(design: HeroDesignV5): string[] {
  const nested = widgetsOf(design).flatMap((w) => {
    const c = w.content
    if (c.kind === 'buttons') return c.items.map((i) => i.id)
    if (c.kind === 'icon-list') return c.items.map((i) => i.id)
    if (c.kind === 'gallery') return c.images.map((i) => i.id)
    return []
  })
  return [
    ...design.sections.map((s) => s.id),
    ...design.sections.flatMap((s) => s.columns.map((c) => c.id)),
    ...widgetsOf(design).map((w) => w.id),
    ...nested,
  ]
}

function objectsOf(value: unknown, into = new Set<object>()): Set<object> {
  if (value && typeof value === 'object' && !into.has(value)) {
    into.add(value)
    Object.values(value).forEach((v) => objectsOf(v, into))
  }
  return into
}

function iconNamesOf(design: HeroDesignV5): string[] {
  return widgetsOf(design).flatMap((w) => {
    const c = w.content
    if (c.kind === 'icon') return [c.name]
    if (c.kind === 'badge') return c.icon ? [c.icon] : []
    if (c.kind === 'icon-list') return c.items.map((i) => i.icon)
    if (c.kind === 'buttons') return c.items.flatMap((i) => (i.icon ? [i.icon] : []))
    return []
  })
}

const cases: [string, () => HeroDesignV5][] = [
  ...HERO_TEMPLATES.map((t): [string, () => HeroDesignV5] => [`template ${t.id}`, t.build]),
  ...SECTION_PRESETS.map((p): [string, () => HeroDesignV5] => [`preset ${p.id}`, () => designOfPreset(p.build())]),
]

describe('hero templates and section presets', () => {
  it('ships 27 templates and 8 presets with unique ids', () => {
    expect(HERO_TEMPLATES).toHaveLength(27)
    expect(SECTION_PRESETS).toHaveLength(8)
    expect(new Set(HERO_TEMPLATES.map((t) => t.id)).size).toBe(HERO_TEMPLATES.length)
    expect(new Set(SECTION_PRESETS.map((p) => p.id)).size).toBe(SECTION_PRESETS.length)
  })

  it('files every template under a category the gallery can filter on', () => {
    for (const template of HERO_TEMPLATES) expect(HERO_TEMPLATE_CATEGORIES).toContain(template.category)
    for (const category of HERO_TEMPLATE_CATEGORIES) {
      expect(HERO_TEMPLATES.some((t) => t.category === category)).toBe(true)
    }
  })

  it('never hides a column that carries content on phones', () => {
    for (const template of HERO_TEMPLATES) {
      const hiddenOnMobile = template.build().sections.flatMap((s) => s.columns.filter((c) => c.mobile?.hidden))
      expect(hiddenOnMobile.filter((c) => c.widgets.length > 0)).toEqual([])
    }
  })

  it('keeps every template to 1–3 sections', () => {
    for (const template of HERO_TEMPLATES) {
      const count = template.build().sections.length
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(3)
    }
  })

  describe.each(cases)('%s', (_name, build) => {
    it('passes the save-time schema', () => {
      const result = heroDesignV5Schema.safeParse(build())
      expect(result.success ? [] : result.error.issues).toEqual([])
    })

    it('has unique ids within the design', () => {
      const ids = idsOf(build())
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('returns fresh ids and shares no objects between build() calls', () => {
      const first = build()
      const second = build()
      const firstIds = new Set(idsOf(first))
      expect(idsOf(second).filter((id) => firstIds.has(id))).toEqual([])
      const firstObjects = objectsOf(first)
      expect([...objectsOf(second)].filter((o) => firstObjects.has(o))).toEqual([])
    })

    it('builds css without throwing', () => {
      const built = buildDesignCss(build(), { scope: 'hb-test' })
      expect(built.css.length).toBeGreaterThan(0)
      expect(built.css).toContain('.hb-test')
    })

    it('only uses icons the renderer knows', () => {
      const unknown = iconNamesOf(build()).filter((name) => !HERO_ICON_NAMES.includes(name))
      expect(unknown).toEqual([])
    })

    it('never sets text larger on phones than on desktop', () => {
      // A widget that sets a desktop size but no phone size inherits the
      // factory's phone default (16px text / 32px heading) — a 12px caption
      // would jump to 16px on phones.
      const grows = widgetsOf(build()).filter((w) => {
        const desktop = w.style.fontSize
        const phone = w.tablet?.fontSize ?? w.mobile?.fontSize
        return desktop !== undefined && phone !== undefined && phone > desktop
      })
      expect(grows.map((w) => `${w.kind}: ${w.style.fontSize} → ${w.mobile?.fontSize}`)).toEqual([])
    })

    it('stacks every section on mobile', () => {
      for (const section of build().sections) expect(section.mobile?.stack).toBe(true)
    })
  })

  it('links order buttons to the storefront menu anchor', () => {
    const labels = /order now|view menu/i
    for (const template of HERO_TEMPLATES) {
      const items = widgetsOf(template.build()).flatMap((w) => (w.content.kind === 'buttons' ? w.content.items : []))
      for (const item of items.filter((i) => labels.test(i.label))) expect(item.href).toBe('#storefront-menu')
    }
  })

  it('gives the video template a still-image background on phones', () => {
    const video = HERO_TEMPLATES.find((t) => t.id === 'video-hero')
    const hero = video?.build().sections[0]
    expect(hero?.style.background?.type).toBe('video')
    expect(hero?.mobile?.background?.type).toBe('image')
  })
})
