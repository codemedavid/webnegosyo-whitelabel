import { LIMITS } from '@/lib/hero-builder/constants'
import { createSection, createWidget } from '@/lib/hero-builder/defaults'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import type { HeroDesignV5, Widget, WidgetContent } from '@/lib/hero-builder/types'

import { ALL_WIDGET_KINDS, designOf } from './helpers'

/** A design holding one default widget of every kind. */
function fullDesign(): HeroDesignV5 {
  const s = createSection([50, 50])
  const widgets = ALL_WIDGET_KINDS.map((kind) => createWidget(kind))
  return designOf([{ ...s, columns: [{ ...s.columns[0], widgets }, s.columns[1]] }], {
    colors: { primary: '#ea580c', text: 'rgb(17, 24, 39)' },
    headingFont: 'playfair-display',
    bodyFont: 'inter',
  })
}

function withWidget(overrides: Partial<Widget> & { content?: WidgetContent }): HeroDesignV5 {
  const design = fullDesign()
  const base = createWidget((overrides.content?.kind ?? overrides.kind ?? 'text') as Widget['kind'])
  const widget = { ...base, ...overrides } as Widget
  const s = design.sections[0]
  return { ...design, sections: [{ ...s, columns: [{ ...s.columns[0], widgets: [widget] }] }] }
}

function messages(design: unknown): string[] {
  const result = heroDesignV5Schema.safeParse(design)
  return result.success ? [] : result.error.issues.map((i) => i.message)
}

describe('heroDesignV5Schema — valid designs', () => {
  it('accepts a design built from defaults with every widget kind', () => {
    // Arrange
    const design = fullDesign()

    // Act
    const result = heroDesignV5Schema.safeParse(design)

    // Assert
    expect(result.success).toBe(true)
  })

  it('accepts an empty design', () => {
    expect(heroDesignV5Schema.safeParse(designOf([])).success).toBe(true)
  })

  it.each(['https://example.com', '/menu', '#storefront-menu', 'mailto:a@b.co', 'tel:+63917', ''])(
    'accepts button href %p',
    (href) => {
      const design = withWidget({
        kind: 'buttons',
        content: { kind: 'buttons', items: [{ id: 'b1', label: 'Go', href, newTab: false, variant: 'solid' }] },
      })
      expect(messages(design)).toEqual([])
    },
  )
})

describe('heroDesignV5Schema — rejections', () => {
  it.each(['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,x', '//evil.com'])(
    'rejects button href %p',
    (href) => {
      const design = withWidget({
        kind: 'buttons',
        content: { kind: 'buttons', items: [{ id: 'b1', label: 'Go', href, newTab: false, variant: 'solid' }] },
      })
      expect(messages(design)).toContain('Links must start with https://, /, #, mailto: or tel:')
    },
  )

  it('rejects an http:// image src', () => {
    const design = withWidget({ kind: 'image', content: { kind: 'image', src: 'http://x.com/a.png', alt: '' } })

    expect(messages(design)).toContain('Images and videos must use an https:// link')
  })

  it('rejects a javascript: image link', () => {
    const design = withWidget({
      kind: 'image',
      content: { kind: 'image', src: 'https://x.com/a.png', alt: '', href: 'javascript:alert(1)' },
    })

    expect(heroDesignV5Schema.safeParse(design).success).toBe(false)
  })

  it.each(['comic-sans', 'Inter', 'constructor', 'toString', '__proto__'])('rejects unknown font %p', (font) => {
    // Arrange
    const design = { ...fullDesign(), theme: { ...fullDesign().theme, headingFont: font } }

    // Act + Assert
    expect(messages(design)).toContain('Unknown font')
  })

  it('rejects an unknown font on a node style', () => {
    const design = withWidget({ kind: 'text', content: { kind: 'text', text: 'x' }, style: { fontFamily: 'wingdings' } })

    expect(messages(design)).toContain('Unknown font')
  })

  it.each(['', 'has space', 'a/b', 'x'.repeat(65), '<script>'])('rejects bad id %p', (id) => {
    const design = withWidget({ id, kind: 'spacer', content: { kind: 'spacer' } })

    expect(messages(design)).toContain('Invalid id')
  })

  it('rejects a widget whose kind does not match its content', () => {
    const design = withWidget({ kind: 'heading', content: { kind: 'text', text: 'x' } })

    expect(messages(design)).toContain('Widget kind does not match its content')
  })

  it('rejects an HTML block longer than LIMITS.htmlLength', () => {
    const design = withWidget({ kind: 'html', content: { kind: 'html', html: 'a'.repeat(LIMITS.htmlLength + 1) } })

    expect(messages(design)).toContain('HTML block is too long (50,000 characters max)')
  })

  it('accepts an HTML block exactly at LIMITS.htmlLength', () => {
    const design = withWidget({ kind: 'html', content: { kind: 'html', html: 'a'.repeat(LIMITS.htmlLength) } })

    expect(messages(design)).toEqual([])
  })

  it('rejects more than LIMITS.sections sections', () => {
    const design = designOf(Array.from({ length: LIMITS.sections + 1 }, () => createSection()))

    expect(messages(design)).toContain(`A hero can have at most ${LIMITS.sections} sections`)
  })

  it('rejects more than LIMITS.widgetsTotal widgets', () => {
    const perSection = Math.ceil((LIMITS.widgetsTotal + 1) / 20)
    const sections = Array.from({ length: 20 }, () => {
      const s = createSection()
      return { ...s, columns: [{ ...s.columns[0], widgets: Array.from({ length: perSection }, () => createWidget('spacer')) }] }
    })

    expect(messages(designOf(sections))).toContain(`A hero can have at most ${LIMITS.widgetsTotal} elements`)
  })

  it('rejects a section without columns', () => {
    const s = createSection()

    expect(heroDesignV5Schema.safeParse(designOf([{ ...s, columns: [] }])).success).toBe(false)
  })

  it.each(['red;}</style>', 'url(x)', '@unknown'])('rejects hostile color %p', (color) => {
    const design = withWidget({ kind: 'text', content: { kind: 'text', text: 'x' }, style: { color } })

    expect(messages(design)).toContain('Invalid color')
  })

  it('rejects an anchor with characters outside [a-z0-9-]', () => {
    const design = fullDesign()
    const bad = { ...design, sections: [{ ...design.sections[0], anchor: '"><script>' }] }

    expect(messages(bad)).toContain('Anchors use lowercase letters, numbers and dashes')
  })

  it('rejects version 4', () => {
    expect(heroDesignV5Schema.safeParse({ ...fullDesign(), version: 4 }).success).toBe(false)
  })

  it('rejects out-of-range numbers', () => {
    const design = withWidget({ kind: 'embed', content: { kind: 'embed', code: 'x', height: LIMITS.embedMaxHeight + 1, autoHeight: true } })

    expect(heroDesignV5Schema.safeParse(design).success).toBe(false)
  })
})
