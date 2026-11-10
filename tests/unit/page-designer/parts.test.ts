import { buildDesignCss } from '@/lib/hero-builder/css'
import { loadHeroDesign } from '@/lib/hero-builder/load'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { PAGE_BLOCKS } from '@/lib/page-designer/blocks'
import {
  applyQuickStyle,
  blockParts,
  buildPartCss,
  isPartKey,
  isValidPartValue,
  partFonts,
  partKey,
  partValues,
  PART_PROPS,
  PARTS,
  QUICK_STYLES,
  withoutParts,
} from '@/lib/page-designer/parts'
import { pageDesignProblem } from '@/lib/page-designer/rules'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'

describe('part keys', () => {
  it('every part prop exists and every key is unique', () => {
    const keys = PARTS.flatMap((part) => part.props.map((prop) => partKey(part.id, prop)))
    expect(new Set(keys).size).toBe(keys.length)
    for (const part of PARTS) for (const prop of part.props) expect(PART_PROPS[prop]).toBeDefined()
    // Stored option keys must stay within the schema's key pattern.
    for (const key of keys) expect(key).toMatch(/^[a-z0-9_]{1,40}$/)
  })

  it('validates colours and choices strictly', () => {
    expect(isValidPartValue('p_option_on_bg', '#ff0000')).toBe(true)
    expect(isValidPartValue('p_option_on_bg', '#ff000080')).toBe(true)
    expect(isValidPartValue('p_option_on_bg', 'red')).toBe(false)
    expect(isValidPartValue('p_option_on_bg', 'url(x)')).toBe(false)
    expect(isValidPartValue('p_card_radius', 'pill')).toBe(true)
    expect(isValidPartValue('p_card_radius', '12px')).toBe(false)
    expect(isValidPartValue('p_card_nope', 'pill')).toBe(false)
    expect(isPartKey('variant')).toBe(false)
  })

  it('keeps only valid values, optionally for some parts', () => {
    const values = { p_card_bg: '#fff', p_title_size: 'xl', p_title_size_x: 'xl', variant: 'tiles', p_field_bg: 'nope' }
    expect(partValues(values)).toEqual({ p_card_bg: '#fff', p_title_size: 'xl' })
    expect(partValues(values, ['title'])).toEqual({ p_title_size: 'xl' })
  })
})

describe('buildPartCss', () => {
  it('writes nothing when nothing is set', () => {
    expect(buildPartCss('.s', {})).toBe('')
    expect(buildPartCss('.s', undefined)).toBe('')
    expect(buildPartCss('.s', { variant: 'tiles' })).toBe('')
  })

  it('styles chosen and not-chosen options separately', () => {
    const css = buildPartCss('.s .n1', { p_option_bg: '#eeeeee', p_option_on_bg: '#111111', p_option_on_color: '#ffffff' })
    expect(css).toContain('.s .n1 [data-part="option"]{background-color:#eeeeee !important;background-image:none !important}')
    expect(css).toContain('.s .n1 [data-part="option"][data-on]{background-color:#111111 !important;background-image:none !important;color:#ffffff !important}')
  })

  it('adds placeholder and focus rules for fields', () => {
    const css = buildPartCss('.s', { p_field_placeholder: '#999999', p_field_focus: '#00aa00' })
    expect(css).toContain('.s [data-part="field"]::placeholder,.s [data-part="field"] input::placeholder,.s [data-part="field"] textarea::placeholder{color:#999999 !important;opacity:1 !important}')
    expect(css).toContain('.s [data-part="field"]:focus,.s [data-part="field"]:focus-within{border-color:#00aa00 !important')
  })

  it('colours the glyph inside an icon circle and the input inside a field wrapper', () => {
    expect(buildPartCss('.s', { p_icon_icon: '#ff0000' })).toContain('.s [data-part="icon"] svg{color:#ff0000 !important}')
    expect(buildPartCss('.s', { p_field_color: '#222222' })).toContain('.s [data-part="field"] input,.s [data-part="field"] textarea,.s [data-part="field"] select{color:#222222 !important}')
  })

  it('a divider is one line: width and style go on its top border', () => {
    const css = buildPartCss('.s', { p_divider_bw: '2', p_divider_bs: 'dashed', p_divider_border: '#000000' })
    expect(css).toContain('border-color:#000000 !important;border-top-width:2px !important;border-top-style:dashed !important')
    expect(css).not.toContain('border-width')
  })

  it('a border width without a style draws a solid border', () => {
    expect(buildPartCss('.s', { p_card_bw: '2' })).toContain('border-width:2px !important;border-style:solid !important')
    expect(buildPartCss('.s', { p_card_bw: '2', p_card_bs: 'dashed' })).not.toContain('border-style:solid')
  })

  it('never injects an invalid value', () => {
    const css = buildPartCss('.s', { p_card_bg: '#fff;}body{display:none', p_title_font: 'constructor', p_card_radius: '__proto__' })
    expect(css).toBe('')
  })

  it('lists google fonts used by parts', () => {
    expect(partFonts({ p_title_font: 'fraunces', p_text_font: 'mono', p_card_bg: '#fff' })).toEqual(['fraunces', 'mono'])
  })
})

describe('quick styles', () => {
  it('replace earlier box choices but keep colours and other settings', () => {
    const start = { variant: 'tiles', p_card_bg: '#ffffff', p_card_shadow: 'hard', p_option_bw: '3' }
    const soft = QUICK_STYLES.find((q) => q.id === 'soft')!
    const next = applyQuickStyle(start, soft)
    expect(next.variant).toBe('tiles')
    expect(next.p_card_bg).toBe('#ffffff')
    expect(next.p_card_shadow).toBe('lg')
    expect(next.p_option_bw).toBe('0')
    for (const style of QUICK_STYLES) for (const [key, value] of Object.entries(style.values)) expect(isValidPartValue(key, value)).toBe(true)
  })

  it('withoutParts keeps the block settings', () => {
    expect(withoutParts({ variant: 'list', p_card_bg: '#fff', color_accent: '#000' })).toEqual({ variant: 'list', color_accent: '#000' })
  })
})

describe('in a page design', () => {
  const withParts = (design: HeroDesignV5, page: Record<string, string>, block: Record<string, string>): HeroDesignV5 => {
    const widget = design.sections[0].columns[0].widgets[0]
    return {
      ...design,
      page: { parts: page },
      sections: design.sections.map((section, i) =>
        i !== 0
          ? section
          : {
              ...section,
              columns: section.columns.map((column, j) =>
                j !== 0
                  ? column
                  : {
                      ...column,
                      widgets: column.widgets.map((w) =>
                        w.id === widget.id && w.content.kind === 'page-block' ? { ...w, content: { ...w.content, options: { ...w.content.options, ...block } } } : w,
                      ),
                    },
              ),
            },
      ),
    }
  }

  it('emits the page parts, then the block parts under the widget class', () => {
    const design = withParts(createStandardDesign('checkout'), { p_card_radius: 'none' }, { p_title_color: '#123456' })
    const { css, classes } = buildDesignCss(design, { scope: 'pd' })
    const widgetId = design.sections[0].columns[0].widgets[0].id
    expect(css).toContain('.pd [data-part="card"]{border-radius:0px !important}')
    expect(css).toContain(`.pd .${classes[widgetId]} [data-part="title"]{color:#123456 !important}`)
  })

  it('an unstyled design gets no part rules', () => {
    const { css } = buildDesignCss(createStandardDesign('checkout'), { scope: 'pd' })
    expect(css).not.toContain('data-part')
  })

  it('page settings survive a load round trip and junk is dropped', () => {
    const design = { ...createStandardDesign('tracking'), page: { parts: { p_card_bg: '#fff', bad: 3 }, layout: 'steps', progress: 'nope' } }
    const loaded = loadHeroDesign(JSON.stringify(design))
    expect(loaded?.page).toEqual({ parts: { p_card_bg: '#fff' }, layout: 'steps' })
  })

  it('publish refuses an invalid page or block style and parts a block does not draw', () => {
    const base = createStandardDesign('checkout')
    expect(pageDesignProblem(withParts(base, { p_card_bg: 'red' }, {}), 'checkout')).toMatch(/page style/)
    expect(pageDesignProblem(withParts(base, {}, { p_card_bg: 'red' }), 'checkout')).toMatch(/style it can't use/)
    expect(pageDesignProblem(withParts(base, { p_card_bg: '#ffffff' }, { p_title_size: 'xl' }), 'checkout')).toBeNull()
  })
})

describe('block registries', () => {
  it('every block lists only known parts', () => {
    const ids = new Set<string>(PARTS.map((p) => p.id))
    for (const blocks of Object.values(PAGE_BLOCKS)) {
      for (const def of blocks) {
        for (const part of def.parts ?? []) expect(ids.has(part)).toBe(true)
        expect(blockParts(def).map((p) => p.id)).toEqual(expect.arrayContaining(['card', 'title', 'subtitle', 'text', 'muted']))
      }
    }
  })
})
