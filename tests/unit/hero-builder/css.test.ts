import { buildDesignCss, buildFontsHref } from '@/lib/hero-builder/css'
import { DEVICE_MAX_WIDTH } from '@/lib/hero-builder/constants'
import { createSection, createWidget } from '@/lib/hero-builder/defaults'
import type { HeroDesignV5, NodeStyle, Widget } from '@/lib/hero-builder/types'

import { ALL_WIDGET_KINDS, column, deepFreeze, designOf, section, spacer } from './helpers'

const HOSTILE = 'red;}</style><script>alert(1)</script>'
const TABLET_BLOCK = `@container hb (max-width: ${DEVICE_MAX_WIDTH.tablet}px){`
const MOBILE_BLOCK = `@container hb (max-width: ${DEVICE_MAX_WIDTH.mobile}px){`

/** The body of one @container block, or null when the sheet has none. */
function containerBlock(css: string, opener: string): string | null {
  const start = css.indexOf(opener)
  if (start < 0) return null
  let depth = 0
  for (let i = start + opener.length - 1; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}') depth--
    if (depth === 0) return css.slice(start + opener.length, i)
  }
  return null
}

/** Desktop part of the sheet (before any container query). */
function desktopPart(css: string): string {
  const idx = css.indexOf('@container hb')
  return idx < 0 ? css : css.slice(0, idx)
}

function hostileStyle(): NodeStyle {
  return {
    color: HOSTILE,
    borderWidth: 2,
    borderColor: HOSTILE,
    accentColor: HOSTILE,
    accentTextColor: '</style><img src=x onerror=alert(1)>',
    fontFamily: "Inter'; } </style><script>alert(1)</script>",
    background: {
      type: 'image',
      color: HOSTILE,
      image: { url: 'https://x.com/a.png?"</style><script>alert(1)</script>', size: 'cover', position: 'center' },
      overlay: { color: HOSTILE, opacity: 50 },
    },
  }
}

function hostileDesign(): HeroDesignV5 {
  const widget: Widget = { ...createWidget('buttons'), style: hostileStyle() }
  const gradientWidget: Widget = {
    ...createWidget('badge'),
    style: {
      background: {
        type: 'gradient',
        gradient: { kind: 'linear', from: HOSTILE, to: '#fff</style>', angle: 90 },
      },
    },
  }
  const imageWidget: Widget = {
    ...createWidget('image'),
    style: {
      background: {
        type: 'image',
        image: { url: 'javascript:alert(1)//</style>', size: 'cover', position: 'center' },
      },
      aspectRatio: '</style>' as never,
      objectFit: '</style>' as never,
      shadow: '</style>' as never,
      textAlign: '</style>' as never,
      align: '</style>' as never,
      verticalAlign: '</style>' as never,
    },
  }
  const s = createSection([50, 50])
  const hostileSection = {
    ...s,
    style: { ...s.style, ...hostileStyle() },
    mobile: { ...hostileStyle(), fontSize: '12px}</style>' as never },
    columns: [
      { ...s.columns[0], widgets: [widget, gradientWidget], tablet: hostileStyle() },
      { ...s.columns[1], widgets: [imageWidget] },
    ],
  }
  return designOf([hostileSection], {
    colors: { primary: HOSTILE, accent: 'url(javascript:alert(1))', text: '@primary', surface: '#fff' },
    headingFont: '</style><script>',
    bodyFont: 'inter',
    buttonRadius: '</style>' as never,
  })
}

describe('buildDesignCss — injection safety', () => {
  it('never emits "<" (so no </style> breakout) for hostile values anywhere in the design', () => {
    // Arrange
    const design = hostileDesign()

    // Act
    const { css } = buildDesignCss(design, { scope: 'hb-test' })

    // Assert
    expect(css).not.toContain('</style')
    expect(css).not.toContain('<')
    expect(css).not.toMatch(/javascript:/i)
    expect(css).not.toContain('onerror')
  })

  it('drops hostile theme colors back to the store-branding fallback', () => {
    const { css } = buildDesignCss(hostileDesign(), { scope: 'hb-test' })

    expect(css).toContain('--hb-primary:var(--brand-primary, #111827)')
    expect(css).toContain('--hb-accent:var(--brand-accent, var(--brand-primary, #ea580c))')
    expect(css).toContain('--hb-surface:#fff')
  })

  it('refuses a theme color that references another theme color (no var cycles)', () => {
    const { css } = buildDesignCss(designOf([], { colors: { text: '@primary' } }), { scope: 'hb-test' })

    expect(css).toContain('--hb-text:var(--brand-text-primary, #111827)')
    expect(css).not.toContain('--hb-text:var(--hb-primary)')
  })

  it('keeps a safe https background image but escapes it inside url("")', () => {
    const design = designOf([
      section('s1', [column('c1', [spacer('w1', {
        style: { background: { type: 'image', image: { url: 'https://x.com/a b.png', size: 'contain', position: 'top' } } },
      })])]),
    ])

    const { css, classes } = buildDesignCss(design, { scope: 'hb-test' })

    expect(css).toContain(`.hb-test .${classes.w1}{`)
    expect(css).toContain('background-image:url("https://x.com/a%20b.png")')
    expect(css).toContain('background-size:contain')
    expect(css).toContain('background-position:top')
  })

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not crash or leak function source for prototype-named keys (%p)',
    (key) => {
      // Arrange
      const design = designOf(
        [
          section('s1', [column('c1', [spacer('w1', {
            style: {
              fontFamily: key,
              shadow: key as never,
              align: key as never,
              verticalAlign: key as never,
              textAlign: key as never,
            },
          })])], { style: { verticalAlign: key as never, align: key as never } }),
        ],
        { headingFont: key, bodyFont: key },
      )

      // Act
      const build = () => buildDesignCss(design, { scope: 'hb-test' })

      // Assert
      expect(build).not.toThrow()
      const { css, fontsHref } = build()
      expect(css).not.toContain('function')
      expect(css).not.toContain('[object')
      expect(css).not.toContain('native code')
      expect(fontsHref).toBeNull()
    },
  )
})

describe('buildDesignCss — responsive overrides', () => {
  it('emits tablet and mobile overrides inside their @container blocks', () => {
    // Arrange
    const w = spacer('w1', { style: { size: 40 }, tablet: { size: 30 }, mobile: { size: 20 } })
    const design = designOf([section('s1', [column('c1', [w])])])

    // Act
    const { css, classes } = buildDesignCss(design, { scope: 'hb-test' })

    // Assert
    const cls = classes.w1
    expect(desktopPart(css)).toContain(`.hb-test .${cls}{height:40px}`)
    expect(containerBlock(css, TABLET_BLOCK)).toContain(`.hb-test .${cls}{height:30px}`)
    expect(containerBlock(css, MOBILE_BLOCK)).toContain(`.hb-test .${cls}{height:20px}`)
  })

  it('omits an override that does not differ from the wider device', () => {
    const w = spacer('w1', { style: { size: 40 }, tablet: { size: 40 }, mobile: { size: 40 } })
    const { css } = buildDesignCss(designOf([section('s1', [column('c1', [w])])]), { scope: 'hb-test' })

    expect(css).not.toContain('@container hb')
  })

  it('lets a tablet override cascade to mobile without repeating it', () => {
    const w = spacer('w1', { style: { size: 40 }, tablet: { size: 30 } })
    const { css, classes } = buildDesignCss(designOf([section('s1', [column('c1', [w])])]), { scope: 'hb-test' })

    expect(containerBlock(css, TABLET_BLOCK)).toContain(`.${classes.w1}{height:30px}`)
    expect(css).not.toContain(MOBILE_BLOCK)
  })

  it('stacks columns on mobile with flex-direction column and full-width columns', () => {
    // Arrange: createSection sets mobile.stack = true
    const s = createSection([50, 50])
    const design = designOf([s])

    // Act
    const { css, classes } = buildDesignCss(design, { scope: 'hb-test' })

    // Assert
    const mobile = containerBlock(css, MOBILE_BLOCK) ?? ''
    const cls = classes[s.id]
    expect(mobile).toContain(`.hb-test .${cls} > .hb-row{`)
    expect(mobile).toMatch(new RegExp(`\\.${cls} > \\.hb-row\\{[^}]*flex-direction:column`))
    expect(mobile).toMatch(new RegExp(`\\.${cls} > \\.hb-row > \\.hb-col\\{[^}]*width:100%`))
    expect(desktopPart(css)).not.toMatch(new RegExp(`\\.${cls} > \\.hb-row\\{[^}]*flex-direction:column`))
  })

  it('uses column-reverse when a stacked section is reversed', () => {
    const s = section('s1', [column('c1'), column('c2')], { mobile: { stack: true, reverse: true } })
    const { css } = buildDesignCss(designOf([s]), { scope: 'hb-test' })

    expect(containerBlock(css, MOBILE_BLOCK)).toContain('flex-direction:column-reverse')
  })
})

describe('buildDesignCss — hidden nodes', () => {
  const hiddenDesign = () =>
    designOf([section('s1', [column('c1', [spacer('w1', { style: { hidden: true } })])])])

  it('hides a hidden node with display:none on the storefront', () => {
    const { css, classes } = buildDesignCss(hiddenDesign(), { scope: 'hb-test' })

    expect(css).toMatch(new RegExp(`\\.${classes.w1}\\{[^}]*display:none`))
  })

  it('shows a hidden node faded (not display:none) in the editor with showHidden', () => {
    const { css, classes } = buildDesignCss(hiddenDesign(), { scope: 'hb-test', showHidden: true })

    const rule = new RegExp(`\\.${classes.w1}\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
    expect(rule).not.toContain('display:none')
    expect(rule).toContain('display:block')
    expect(rule).toContain('outline:2px dashed')
  })

  it('hides only on mobile when the mobile layer sets hidden', () => {
    const d = designOf([section('s1', [column('c1', [spacer('w1', { mobile: { hidden: true } })])])])
    const { css, classes } = buildDesignCss(d, { scope: 'hb-test' })

    expect(desktopPart(css)).not.toMatch(new RegExp(`\\.${classes.w1}\\{[^}]*display:none`))
    expect(containerBlock(css, MOBILE_BLOCK)).toMatch(new RegExp(`\\.${classes.w1}\\{[^}]*display:none`))
  })
})

describe('buildDesignCss — classes, theme refs, fonts, scope', () => {
  it('maps every section, column and widget id to a unique class', () => {
    // Arrange
    const s = createSection([50, 50])
    const widgets = ALL_WIDGET_KINDS.map((k) => createWidget(k))
    const design = designOf([
      { ...s, columns: [{ ...s.columns[0], widgets }, s.columns[1]] },
      createSection([100]),
    ])
    const ids = design.sections.flatMap((sec) => [
      sec.id,
      ...sec.columns.flatMap((c) => [c.id, ...c.widgets.map((w) => w.id)]),
    ])

    // Act
    const { classes, css } = buildDesignCss(design, { scope: 'hb-test' })

    // Assert
    expect(Object.keys(classes).sort()).toEqual([...ids].sort())
    expect(new Set(Object.values(classes)).size).toBe(ids.length)
    for (const cls of Object.values(classes)) expect(cls).toMatch(/^n[0-9a-z]+$/)
    expect(css).not.toContain('<')
  })

  it('turns theme color references into var(--hb-*)', () => {
    const d = designOf([section('s1', [column('c1', [spacer('w1', { style: { color: '@primary' } })])])])
    const { css, classes } = buildDesignCss(d, { scope: 'hb-test' })

    expect(css).toContain(`.${classes.w1}{color:var(--hb-primary)}`)
  })

  it('does not mutate the design', () => {
    const design = deepFreeze(hostileDesign())

    expect(() => buildDesignCss(design, { scope: 'hb-test' })).not.toThrow()
  })

  it('includes only fonts the design actually uses in the Google Fonts href', () => {
    // Arrange
    const d = designOf(
      [section('s1', [column('c1', [spacer('w1', { style: { fontFamily: 'heading' }, mobile: { fontFamily: 'lora' } })])])],
      { headingFont: 'playfair-display', bodyFont: 'system' },
    )

    // Act
    const { fontsHref } = buildDesignCss(d, { scope: 'hb-test' })

    // Assert
    expect(fontsHref).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/)
    expect(fontsHref).toContain('family=Lora:wght@')
    expect(fontsHref).toContain('family=Playfair+Display:wght@')
    expect(fontsHref).not.toContain('Inter')
    expect(fontsHref).not.toContain('System')
    expect(fontsHref).toContain('display=swap')
  })

  it('returns a null fonts href when the design uses no Google fonts', () => {
    const { fontsHref } = buildDesignCss(designOf([], { headingFont: 'heading', bodyFont: 'system' }), { scope: 'hb-test' })

    expect(fontsHref).toBeNull()
    expect(buildFontsHref(['nope', 'system'])).toBeNull()
  })

  it.each(['', 'Bad Scope', '1abc', 'x;}body{', 'a'.repeat(60), 'hb_root'])(
    'falls back to hb-root for an invalid scope %p',
    (scope) => {
      const { css } = buildDesignCss(designOf([]), { scope })

      expect(css.startsWith('.hb-root{')).toBe(true)
      expect(css).toContain('.hb-root{--hb-primary:')
    },
  )

  it('uses a valid scope everywhere instead of the .S placeholder', () => {
    const { css } = buildDesignCss(designOf([createSection()]), { scope: 'hb-abc1' })

    expect(css.startsWith('.hb-abc1{')).toBe(true)
    expect(css).not.toMatch(/\.S\b/)
  })

  it('emits an animation rule only for known animation types', () => {
    const d = designOf([
      section('s1', [
        column('c1', [
          spacer('w1', { animation: { type: 'fade', duration: 50, delay: 99999 } }),
          spacer('w2', { animation: { type: 'explode' as never, duration: 500, delay: 0 } }),
        ]),
      ]),
    ])

    const { css, classes } = buildDesignCss(d, { scope: 'hb-test' })

    expect(css).toContain(`.${classes.w1}{animation:hb-fade 100ms cubic-bezier(.2,.7,.2,1) 6000ms both}`)
    expect(css).not.toContain(`.${classes.w2}{animation:`)
  })
})

describe('buildDesignCss — centred boxed widgets', () => {
  function cssForDivider(style: NodeStyle): { css: string; cls: string } {
    const divider: Widget = { ...createWidget('divider'), id: 'w-divider', style }
    const design = designOf([section('s1', [column('c1', [divider])])])
    const built = buildDesignCss(design, { scope: 'hb-test' })
    return { css: built.css, cls: built.classes['w-divider'] }
  }

  it('fills up to its max width so a centred divider never collapses to 0px', () => {
    // Arrange + Act — auto inline margins shrink a flex item to its content,
    // and an <hr> has none, so the widget must claim the width explicitly.
    const { css, cls } = cssForDivider({ maxWidth: 64, textAlign: 'center', size: 1 })

    // Assert
    const rule = css.match(new RegExp(`\\.hb-test \\.${cls}\\{([^}]*)\\}`))?.[1] ?? ''
    expect(rule).toContain('margin-inline:auto')
    expect(rule).toContain('width:100%')
  })

  it('keeps an explicit percent width over the fill', () => {
    // Arrange + Act
    const { css, cls } = cssForDivider({ maxWidth: 64, width: 40, textAlign: 'center' })

    // Assert
    const rule = css.match(new RegExp(`\\.hb-test \\.${cls}\\{([^}]*)\\}`))?.[1] ?? ''
    expect(rule).toContain('width:40%')
    expect(rule).not.toContain('width:100%')
  })
})
