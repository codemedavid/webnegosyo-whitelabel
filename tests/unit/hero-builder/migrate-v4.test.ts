import { isV4Design, migrateV4Design } from '@/lib/hero-builder/migrate-v4'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import type { Widget } from '@/lib/hero-builder/types'
import type {
  BlockColumn,
  BlockSection,
  BlockWidget,
  HeroBlockDesign,
  WidgetProps,
} from '@/types/hero-block-designer'

import { deepFreeze } from './helpers'

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 }

function v4Widget(props: WidgetProps, extra: Partial<BlockWidget> = {}): BlockWidget {
  return {
    id: `v4-${props.kind}`,
    type: props.kind,
    label: props.kind,
    alignment: 'left',
    width: '100%',
    margin: { top: 0, bottom: 0 },
    padding: ZERO,
    background: { type: 'none' },
    props,
    animation: { type: 'none', duration: 600, delay: 0 },
    visibility: { desktop: true, tablet: true, mobile: true },
    ...extra,
  }
}

function textProps(content: string, fontSize: number, extra: Partial<WidgetProps> = {}): WidgetProps {
  return {
    kind: 'text',
    content,
    fontFamily: "'Poppins', sans-serif",
    fontSize,
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: 0,
    color: '#111111',
    textAlign: 'left',
    textShadow: '',
    bold: false,
    italic: false,
    underline: false,
    ...extra,
  } as WidgetProps
}

function buttonProps(extra: Record<string, unknown> = {}): WidgetProps {
  return {
    kind: 'button',
    text: 'Order',
    linkUrl: 'https://shop.example.com',
    linkTarget: '_blank',
    backgroundColor: '#ff0000',
    textColor: '#ffffff',
    borderWidth: 0,
    borderColor: '#000000',
    borderRadius: 8,
    hoverEffect: 'none',
    fontSize: 16,
    fontWeight: 600,
    ...extra,
  } as WidgetProps
}

function v4Column(widgets: BlockWidget[], extra: Partial<BlockColumn> = {}): BlockColumn {
  return {
    id: 'col',
    width: 100,
    widgets,
    settings: { verticalAlign: 'top', horizontalAlign: 'left', padding: ZERO, background: { type: 'none' }, borderRadius: 0 },
    ...extra,
  }
}

function v4Section(columns: BlockColumn[], extra: Partial<BlockSection> = {}): BlockSection {
  return {
    id: 'sec',
    label: 'Hero',
    columns,
    settings: {
      contentWidth: 1100,
      horizontalAlign: 'center',
      minHeight: 500,
      background: { type: 'color', color: '#fafafa' },
      padding: { top: 40, right: 20, bottom: 40, left: 20 },
      margin: { top: 0, bottom: 0 },
    },
    ...extra,
  }
}

function v4Design(sections: BlockSection[], globalStyles: Partial<HeroBlockDesign['globalStyles']> = {}): HeroBlockDesign {
  return { version: 4, sections, globalStyles: { backgroundColor: '#ffffff', maxWidth: 1200, ...globalStyles } }
}

function onlyWidgets(design: ReturnType<typeof migrateV4Design>): Widget[] {
  return design.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets))
}

function migrateOne(widget: BlockWidget): Widget {
  const [w] = onlyWidgets(migrateV4Design(v4Design([v4Section([v4Column([widget])])])))
  return w
}

describe('isV4Design', () => {
  it('detects version 4 only', () => {
    expect(isV4Design({ version: 4 })).toBe(true)
    expect(isV4Design({ version: 5 })).toBe(false)
    expect(isV4Design(null)).toBe(false)
    expect(isV4Design('x')).toBe(false)
  })
})

describe('migrateV4Design — widgets', () => {
  it('turns large text (>= 28px) into a heading and small text into text', () => {
    // Arrange
    const design = v4Design([v4Section([v4Column([
      v4Widget(textProps('Big title', 48)),
      v4Widget(textProps('Exactly 28', 28)),
      v4Widget(textProps('Body copy', 16)),
    ])])])

    // Act
    const widgets = onlyWidgets(migrateV4Design(design))

    // Assert
    expect(widgets.map((w) => w.kind)).toEqual(['heading', 'heading', 'text'])
    expect(widgets[0].content).toEqual({ kind: 'heading', text: 'Big title', tag: 'h2' })
    expect(widgets[0].style).toMatchObject({ fontSize: 48, color: '#111111', fontFamily: 'poppins' })
    expect(widgets[2].content).toEqual({ kind: 'text', text: 'Body copy' })
  })

  it('converts a v4 button into a single buttons item', () => {
    const w = migrateOne(v4Widget(buttonProps()))

    expect(w.kind).toBe('buttons')
    expect(w.content.kind === 'buttons' && w.content.items).toEqual([
      expect.objectContaining({ label: 'Order', href: 'https://shop.example.com/', newTab: true, variant: 'solid' }),
    ])
    expect(w.style).toMatchObject({ accentColor: '#ff0000', accentTextColor: '#ffffff', radius: 8 })
  })

  it('detects an outline button (transparent bg + border) and uses the border color as accent', () => {
    const w = migrateOne(v4Widget(buttonProps({ backgroundColor: 'transparent', borderWidth: 2, borderColor: '#00ff00' })))

    expect(w.content.kind === 'buttons' && w.content.items[0].variant).toBe('outline')
    expect(w.style.accentColor).toBe('#00ff00')
  })

  it.each(['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,x', '//evil.com'])(
    'drops unsafe button link %p',
    (linkUrl) => {
      const w = migrateOne(v4Widget(buttonProps({ linkUrl })))

      expect(w.content.kind === 'buttons' && w.content.items[0].href).toBe('')
    },
  )

  it.each(['http://x.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AA'])('drops unsafe image src %p', (src) => {
    const w = migrateOne(v4Widget({ kind: 'image', src, alt: 'A', objectFit: 'cover', borderRadius: 4, opacity: 1 }))

    expect(w.content).toEqual({ kind: 'image', src: '', alt: 'A' })
  })

  it('keeps a safe https image and converts fractional opacity to percent', () => {
    const w = migrateOne(v4Widget({ kind: 'image', src: 'https://x.com/a.png', alt: '', objectFit: 'contain', borderRadius: 4, opacity: 0.5 }))

    expect(w.content).toMatchObject({ src: 'https://x.com/a.png' })
    expect(w.style).toMatchObject({ opacity: 50, objectFit: 'contain', radius: 4 })
  })

  it('drops vertical dividers and animated backgrounds', () => {
    const design = v4Design([v4Section([v4Column([
      v4Widget({ kind: 'divider', orientation: 'vertical', thickness: 1, color: '#000', style: 'solid' }),
      v4Widget({ kind: 'animated-bg', gradientType: 'none', gradientColors: [], gradientAngle: 0, patternType: 'none', patternOpacity: 0, parallax: false }),
      v4Widget({ kind: 'divider', orientation: 'horizontal', thickness: 2, color: '#000', style: 'dashed' }),
    ])])])

    expect(onlyWidgets(migrateV4Design(design)).map((w) => w.content)).toEqual([{ kind: 'divider', lineStyle: 'dashed' }])
  })

  it('maps visibility into hidden overrides per device', () => {
    // Arrange
    const tabletOnlyHidden = v4Widget(textProps('x', 16), { visibility: { desktop: true, tablet: false, mobile: true } })
    const desktopHidden = v4Widget(textProps('y', 16), { visibility: { desktop: false, tablet: true, mobile: true } })
    const mobileHidden = v4Widget(textProps('z', 16), { visibility: { desktop: true, tablet: true, mobile: false } })

    // Act
    const [a, b, c] = onlyWidgets(migrateV4Design(v4Design([v4Section([v4Column([tabletOnlyHidden, desktopHidden, mobileHidden])])])))

    // Assert
    expect(a.style.hidden).toBeUndefined()
    expect(a.tablet).toEqual({ hidden: true })
    expect(a.mobile).toEqual({ hidden: false })

    expect(b.style.hidden).toBe(true)
    expect(b.tablet).toEqual({ hidden: false })
    expect(b.mobile).toBeUndefined()

    expect(c.style.hidden).toBeUndefined()
    expect(c.tablet).toBeUndefined()
    expect(c.mobile).toEqual({ hidden: true })
  })

  it('maps v4 animations onto v5 types', () => {
    const w = migrateOne(v4Widget(textProps('x', 16), { animation: { type: 'scaleIn', duration: 900, delay: 100 } }))

    expect(w.animation).toEqual({ type: 'zoom', duration: 900, delay: 100 })
  })

  it('drops unsafe text colors', () => {
    const w = migrateOne(v4Widget(textProps('x', 16, { color: 'red;}</style><script>' } as never)))

    expect(w.style.color).toBeUndefined()
  })
})

describe('migrateV4Design — sections and backgrounds', () => {
  it('parses a CSS gradient string into from/to/angle', () => {
    // Arrange
    const s = v4Section([v4Column([v4Widget(textProps('x', 16))])], {
      settings: {
        ...v4Section([]).settings,
        background: { type: 'gradient', gradient: 'linear-gradient(135deg, #ff0000 0%, rgba(0, 0, 255, 0.5) 100%)' },
      },
    })

    // Act
    const [section] = migrateV4Design(v4Design([s])).sections

    // Assert
    expect(section.style.background).toEqual({
      type: 'gradient',
      gradient: { kind: 'linear', from: '#ff0000', to: 'rgba(0, 0, 255, 0.5)', angle: 135 },
    })
  })

  it('detects radial gradients and normalises negative angles', () => {
    const radial = v4Section([v4Column([v4Widget(textProps('x', 16))])], {
      settings: { ...v4Section([]).settings, background: { type: 'gradient', gradient: 'radial-gradient(circle, #000, #fff)' } },
    })
    const negative = v4Section([v4Column([v4Widget(textProps('x', 16))])], {
      settings: { ...v4Section([]).settings, background: { type: 'gradient', gradient: 'linear-gradient(-90deg, #000, #fff)' } },
    })

    const [a, b] = migrateV4Design(v4Design([radial, negative])).sections

    expect(a.style.background?.gradient?.kind).toBe('radial')
    expect(b.style.background?.gradient?.angle).toBe(270)
  })

  it('drops an unparseable gradient and an http:// section image', () => {
    const bad = v4Section([v4Column([v4Widget(textProps('x', 16))])], {
      settings: { ...v4Section([]).settings, background: { type: 'gradient', gradient: 'url(javascript:alert(1))' } },
    })
    const http = v4Section([v4Column([v4Widget(textProps('x', 16))])], {
      settings: { ...v4Section([]).settings, background: { type: 'image', image: 'http://x.com/bg.png' } },
    })

    const [a, b] = migrateV4Design(v4Design([bad, http], { backgroundColor: 'transparent' })).sections

    expect(a.style.background).toBeUndefined()
    expect(b.style.background).toBeUndefined()
  })

  it('stacks columns on mobile and drops sections left with no columns', () => {
    const design = migrateV4Design(v4Design([v4Section([v4Column([])]), v4Section([])]))

    expect(design.sections).toHaveLength(1)
    expect(design.sections[0].mobile).toEqual({ stack: true })
  })

  it('applies the global background image to the first section without a background', () => {
    const s = v4Section([v4Column([])], { settings: { ...v4Section([]).settings, background: { type: 'image', image: '' } } })

    const [section] = migrateV4Design(v4Design([s], { backgroundColor: 'transparent', backgroundImage: 'https://x.com/bg.jpg' })).sections

    expect(section.style.background).toEqual({ type: 'image', image: { url: 'https://x.com/bg.jpg', size: 'cover', position: 'center' } })
  })
})

describe('migrateV4Design — output validity', () => {
  it('produces a v5 design that passes the save-time schema, without mutating the input', () => {
    // Arrange
    const design = deepFreeze(v4Design([v4Section([
      v4Column([
        v4Widget(textProps('Title', 40), { visibility: { desktop: true, tablet: true, mobile: false } }),
        v4Widget(textProps('Body', 16), { responsiveOverrides: { mobile: { alignment: 'center', props: { fontSize: 14 } as never } } }),
        v4Widget(buttonProps({ linkUrl: 'javascript:alert(1)' })),
        v4Widget({ kind: 'image', src: 'https://x.com/a.png', alt: 'a', objectFit: 'cover', borderRadius: 8, opacity: 1 }),
        v4Widget({ kind: 'spacer', height: 24 }),
        v4Widget({ kind: 'icon', iconName: 'Star', size: 32, color: '#000' }),
        v4Widget({ kind: 'social-proof', presetType: 'orders', text: 'orders', number: 500, iconName: 'Users', badgeStyle: 'pill', backgroundColor: '#eee', textColor: '#111' }),
        v4Widget({ kind: 'countdown', targetDate: '2030-01-01T00:00:00.000Z', showDays: true, showHours: true, showMinutes: true, showSeconds: true, fontSize: 20, color: '#000', separatorColor: '#000' }),
        v4Widget({ kind: 'video', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', autoplay: false, muted: true, loop: false, posterImage: '' }),
      ], { width: 60 }),
      v4Column([v4Widget({ kind: 'shape', shapeType: 'circle', fillColor: '#f00', borderWidth: 0, borderColor: '#000', borderRadius: 0, opacity: 1 })], { width: 40 }),
    ])]))
    const before = structuredClone(design)

    // Act
    const v5 = migrateV4Design(design)
    const result = heroDesignV5Schema.safeParse(v5)

    // Assert
    expect(result.success ? [] : result.error.issues).toEqual([])
    expect(v5.version).toBe(5)
    expect(design).toEqual(before)
  })
})
