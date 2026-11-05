import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import { PAGE_IDS } from '@/lib/page-designer/pages'
import { pageDesignProblem } from '@/lib/page-designer/rules'
import { PAGE_TEMPLATE_CATEGORIES, PAGE_TEMPLATES } from '@/lib/page-designer/templates'
import { LIMITS } from '@/lib/hero-builder/constants'

describe('Page Designer templates', () => {
  it.each(PAGE_IDS)('%s: every template is publishable as-is', (page) => {
    const ids = PAGE_TEMPLATES[page].map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const template of PAGE_TEMPLATES[page]) {
      const design = template.build()
      const parsed = heroDesignV5Schema.safeParse(design)
      expect({ id: template.id, ok: parsed.success, issue: parsed.success ? null : parsed.error.issues[0] }).toEqual({ id: template.id, ok: true, issue: null })
      expect({ id: template.id, problem: pageDesignProblem(design, page) }).toEqual({ id: template.id, problem: null })
      expect(JSON.stringify(design).length).toBeLessThan(LIMITS.designBytes)
      expect(PAGE_TEMPLATE_CATEGORIES).toContain(template.category)
    }
  })

  it('builds a fresh copy each time (no shared ids between picks)', () => {
    for (const page of PAGE_IDS) {
      for (const template of PAGE_TEMPLATES[page]) {
        expect(template.build().sections[0]?.id).not.toBe(template.build().sections[0]?.id)
      }
    }
  })
})
