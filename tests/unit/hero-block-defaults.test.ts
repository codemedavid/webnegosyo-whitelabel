import { describe, it, expect } from '@jest/globals'
import {
  ZERO_SPACING,
  ZERO_MARGIN,
  NO_ANIMATION,
  NO_BACKGROUND,
  DEFAULT_VISIBILITY,
  COLUMN_PRESETS,
  createColumn,
  createSection,
  createTextWidget,
  createImageWidget,
  createButtonWidget,
  createShapeWidget,
  createDividerWidget,
  createSpacerWidget,
  createIconWidget,
  createVideoWidget,
  createCountdownWidget,
  createSocialProofWidget,
  createAnimatedBgWidget,
  widgetFactories,
  createBlankBlockDesign,
  getActiveWidgetProps,
  getActiveSectionSettings,
  getActiveColumnSettings,
} from '@/lib/hero-block-defaults'
import type {
  BlockWidgetType,
  TextWidgetProps,
  ImageWidgetProps,
  ButtonWidgetProps,
  ShapeWidgetProps,
  DividerWidgetProps,
  SpacerWidgetProps,
  IconWidgetProps,
  VideoWidgetProps,
  CountdownWidgetProps,
  SocialProofWidgetProps,
  AnimatedBgWidgetProps,
  BlockWidget,
  BlockSection,
  BlockColumn,
} from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('ZERO_SPACING', () => {
  it('has all four sides set to zero', () => {
    expect(ZERO_SPACING).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})

describe('ZERO_MARGIN', () => {
  it('has top and bottom set to zero', () => {
    expect(ZERO_MARGIN).toEqual({ top: 0, bottom: 0 })
  })
})

describe('NO_ANIMATION', () => {
  it('is a none animation with 400ms duration and 0 delay', () => {
    expect(NO_ANIMATION).toEqual({ type: 'none', duration: 400, delay: 0 })
  })
})

describe('DEFAULT_VISIBILITY', () => {
  it('has all breakpoints set to true', () => {
    expect(DEFAULT_VISIBILITY).toEqual({
      desktop: true,
      tablet: true,
      mobile: true,
    })
  })
})

describe('NO_BACKGROUND', () => {
  it('has type none', () => {
    expect(NO_BACKGROUND).toEqual({ type: 'none' })
  })
})

describe('COLUMN_PRESETS', () => {
  it('contains exactly 7 presets', () => {
    expect(COLUMN_PRESETS).toHaveLength(7)
  })

  it('has widths that all sum to 100', () => {
    for (const preset of COLUMN_PRESETS) {
      const sum = preset.widths.reduce((a, b) => a + b, 0)
      expect(sum).toBe(100)
    }
  })

  it('includes expected preset ids', () => {
    const ids = COLUMN_PRESETS.map((p) => p.id)
    expect(ids).toContain('1-col')
    expect(ids).toContain('2-col-equal')
    expect(ids).toContain('2-col-70-30')
    expect(ids).toContain('2-col-30-70')
    expect(ids).toContain('3-col-equal')
    expect(ids).toContain('4-col-equal')
    expect(ids).toContain('3-col-25-50-25')
  })

  it('1-col preset has widths [100]', () => {
    const preset = COLUMN_PRESETS.find((p) => p.id === '1-col')
    expect(preset?.widths).toEqual([100])
  })

  it('2-col-equal preset has widths [50, 50]', () => {
    const preset = COLUMN_PRESETS.find((p) => p.id === '2-col-equal')
    expect(preset?.widths).toEqual([50, 50])
  })

  it('3-col-equal preset has widths [33, 34, 33]', () => {
    const preset = COLUMN_PRESETS.find((p) => p.id === '3-col-equal')
    expect(preset?.widths).toEqual([33, 34, 33])
  })

  it('4-col-equal preset has widths [25, 25, 25, 25]', () => {
    const preset = COLUMN_PRESETS.find((p) => p.id === '4-col-equal')
    expect(preset?.widths).toEqual([25, 25, 25, 25])
  })
})

// ---------------------------------------------------------------------------
// createColumn
// ---------------------------------------------------------------------------

describe('createColumn', () => {
  it('creates a column with the given width', () => {
    const col = createColumn(50)
    expect(col.width).toBe(50)
  })

  it('has a unique id', () => {
    const col1 = createColumn(50)
    const col2 = createColumn(50)
    expect(col1.id).not.toBe(col2.id)
  })

  it('has empty widgets array', () => {
    const col = createColumn(100)
    expect(col.widgets).toEqual([])
  })

  it('has default settings', () => {
    const col = createColumn(33)
    expect(col.settings.verticalAlign).toBe('top')
    expect(col.settings.horizontalAlign).toBe('left')
    expect(col.settings.padding).toEqual(ZERO_SPACING)
    expect(col.settings.background).toEqual({ type: 'none' })
    expect(col.settings.borderRadius).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// createSection
// ---------------------------------------------------------------------------

describe('createSection', () => {
  it('creates a section with a single 100-width column by default', () => {
    const section = createSection()
    expect(section.columns).toHaveLength(1)
    expect(section.columns[0].width).toBe(100)
  })

  it('creates columns matching provided widths', () => {
    const section = createSection([70, 30])
    expect(section.columns).toHaveLength(2)
    expect(section.columns[0].width).toBe(70)
    expect(section.columns[1].width).toBe(30)
  })

  it('has a unique id', () => {
    const s1 = createSection()
    const s2 = createSection()
    expect(s1.id).not.toBe(s2.id)
  })

  it('has a label', () => {
    const section = createSection()
    expect(typeof section.label).toBe('string')
    expect(section.label.length).toBeGreaterThan(0)
  })

  it('has correct default settings', () => {
    const section = createSection()
    expect(section.settings.contentWidth).toBe(1200)
    expect(section.settings.horizontalAlign).toBe('center')
    expect(section.settings.minHeight).toBe(0)
    expect(section.settings.background).toEqual({ type: 'color', color: 'none' })
    expect(section.settings.padding).toEqual({ top: 40, right: 20, bottom: 40, left: 20 })
    expect(section.settings.margin).toEqual({ top: 0, bottom: 0 })
  })
})

// ---------------------------------------------------------------------------
// Widget factories
// ---------------------------------------------------------------------------

describe('createTextWidget', () => {
  it('returns a widget with type "text"', () => {
    const w = createTextWidget()
    expect(w.type).toBe('text')
  })

  it('has correct default props', () => {
    const w = createTextWidget()
    const p = w.props as TextWidgetProps
    expect(p.kind).toBe('text')
    expect(p.content).toBe('Your Heading Here')
    expect(p.fontSize).toBe(48)
    expect(p.fontWeight).toBe(700)
    expect(p.color).toBe('#000000')
    expect(p.textAlign).toBe('center')
  })

  it('has alignment center and width full', () => {
    const w = createTextWidget()
    expect(w.alignment).toBe('center')
    expect(w.width).toBe('full')
  })
})

describe('createImageWidget', () => {
  it('returns a widget with type "image"', () => {
    const w = createImageWidget()
    expect(w.type).toBe('image')
  })

  it('has correct default props', () => {
    const w = createImageWidget()
    const p = w.props as ImageWidgetProps
    expect(p.kind).toBe('image')
    expect(p.src).toBe('')
    expect(p.objectFit).toBe('cover')
    expect(p.opacity).toBe(1)
  })

  it('has width auto', () => {
    const w = createImageWidget()
    expect(w.width).toBe('auto')
  })
})

describe('createButtonWidget', () => {
  it('returns a widget with type "button"', () => {
    const w = createButtonWidget()
    expect(w.type).toBe('button')
  })

  it('has correct default props', () => {
    const w = createButtonWidget()
    const p = w.props as ButtonWidgetProps
    expect(p.kind).toBe('button')
    expect(p.text).toBe('Order Now')
    expect(p.backgroundColor).toBe('#FF3B30')
    expect(p.textColor).toBe('#FFFFFF')
    expect(p.borderRadius).toBe(8)
  })

  it('has width auto', () => {
    const w = createButtonWidget()
    expect(w.width).toBe('auto')
  })
})

describe('createShapeWidget', () => {
  it('returns a widget with type "shape"', () => {
    const w = createShapeWidget()
    expect(w.type).toBe('shape')
  })

  it('has correct default props', () => {
    const w = createShapeWidget()
    const p = w.props as ShapeWidgetProps
    expect(p.kind).toBe('shape')
    expect(p.shapeType).toBe('rectangle')
    expect(p.fillColor).toBe('#E5E7EB')
  })
})

describe('createDividerWidget', () => {
  it('returns a widget with type "divider"', () => {
    const w = createDividerWidget()
    expect(w.type).toBe('divider')
  })

  it('has correct default props', () => {
    const w = createDividerWidget()
    const p = w.props as DividerWidgetProps
    expect(p.kind).toBe('divider')
    expect(p.orientation).toBe('horizontal')
    expect(p.thickness).toBe(2)
    expect(p.color).toBe('#D1D5DB')
    expect(p.style).toBe('solid')
  })
})

describe('createSpacerWidget', () => {
  it('returns a widget with type "spacer"', () => {
    const w = createSpacerWidget()
    expect(w.type).toBe('spacer')
  })

  it('has height 40', () => {
    const w = createSpacerWidget()
    const p = w.props as SpacerWidgetProps
    expect(p.kind).toBe('spacer')
    expect(p.height).toBe(40)
  })
})

describe('createIconWidget', () => {
  it('returns a widget with type "icon"', () => {
    const w = createIconWidget()
    expect(w.type).toBe('icon')
  })

  it('has correct default props', () => {
    const w = createIconWidget()
    const p = w.props as IconWidgetProps
    expect(p.kind).toBe('icon')
    expect(p.iconName).toBe('Star')
    expect(p.size).toBe(48)
  })

  it('has width auto', () => {
    const w = createIconWidget()
    expect(w.width).toBe('auto')
  })
})

describe('createVideoWidget', () => {
  it('returns a widget with type "video"', () => {
    const w = createVideoWidget()
    expect(w.type).toBe('video')
  })

  it('has correct default props', () => {
    const w = createVideoWidget()
    const p = w.props as VideoWidgetProps
    expect(p.kind).toBe('video')
    expect(p.autoplay).toBe(true)
    expect(p.muted).toBe(true)
    expect(p.loop).toBe(true)
    expect(p.videoUrl).toBe('')
  })
})

describe('createCountdownWidget', () => {
  it('returns a widget with type "countdown"', () => {
    const w = createCountdownWidget()
    expect(w.type).toBe('countdown')
  })

  it('has all segments shown', () => {
    const w = createCountdownWidget()
    const p = w.props as CountdownWidgetProps
    expect(p.kind).toBe('countdown')
    expect(p.showDays).toBe(true)
    expect(p.showHours).toBe(true)
    expect(p.showMinutes).toBe(true)
    expect(p.showSeconds).toBe(true)
    expect(p.fontSize).toBe(36)
  })

  it('has a target date in the future', () => {
    const w = createCountdownWidget()
    const p = w.props as CountdownWidgetProps
    const target = new Date(p.targetDate)
    expect(target.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('createSocialProofWidget', () => {
  it('returns a widget with type "social-proof"', () => {
    const w = createSocialProofWidget()
    expect(w.type).toBe('social-proof')
  })

  it('has correct default props', () => {
    const w = createSocialProofWidget()
    const p = w.props as SocialProofWidgetProps
    expect(p.kind).toBe('social-proof')
    expect(p.presetType).toBe('orders')
    expect(p.text).toBe('Orders Served')
    expect(p.number).toBe(10000)
  })

  it('has width auto', () => {
    const w = createSocialProofWidget()
    expect(w.width).toBe('auto')
  })
})

describe('createAnimatedBgWidget', () => {
  it('returns a widget with type "animated-bg"', () => {
    const w = createAnimatedBgWidget()
    expect(w.type).toBe('animated-bg')
  })

  it('has correct default props', () => {
    const w = createAnimatedBgWidget()
    const p = w.props as AnimatedBgWidgetProps
    expect(p.kind).toBe('animated-bg')
    expect(p.gradientType).toBe('linear')
    expect(p.gradientColors).toEqual(['#667eea', '#764ba2'])
    expect(p.gradientAngle).toBe(135)
  })
})

// ---------------------------------------------------------------------------
// All widgets — shared invariants
// ---------------------------------------------------------------------------

describe('widget shared invariants', () => {
  const allFactories = [
    createTextWidget,
    createImageWidget,
    createButtonWidget,
    createShapeWidget,
    createDividerWidget,
    createSpacerWidget,
    createIconWidget,
    createVideoWidget,
    createCountdownWidget,
    createSocialProofWidget,
    createAnimatedBgWidget,
  ]

  it('every widget has a unique id', () => {
    const ids = allFactories.map((fn) => fn().id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('every widget has default visibility all true', () => {
    for (const fn of allFactories) {
      const w = fn()
      expect(w.visibility).toEqual({ desktop: true, tablet: true, mobile: true })
    }
  })

  it('every widget has no animation by default', () => {
    for (const fn of allFactories) {
      const w = fn()
      expect(w.animation).toEqual(NO_ANIMATION)
    }
  })

  it('every widget has zero margin and padding', () => {
    for (const fn of allFactories) {
      const w = fn()
      expect(w.margin).toEqual(ZERO_MARGIN)
      expect(w.padding).toEqual(ZERO_SPACING)
    }
  })

  it('every widget has no background by default', () => {
    for (const fn of allFactories) {
      const w = fn()
      expect(w.background).toEqual(NO_BACKGROUND)
    }
  })
})

// ---------------------------------------------------------------------------
// widgetFactories map
// ---------------------------------------------------------------------------

describe('widgetFactories', () => {
  const expectedTypes: BlockWidgetType[] = [
    'text',
    'image',
    'button',
    'shape',
    'divider',
    'spacer',
    'icon',
    'video',
    'countdown',
    'social-proof',
    'animated-bg',
  ]

  it('has a factory for every widget type', () => {
    for (const t of expectedTypes) {
      expect(widgetFactories[t]).toBeDefined()
      expect(typeof widgetFactories[t]).toBe('function')
    }
  })

  it('each factory produces a widget with the matching type', () => {
    for (const t of expectedTypes) {
      const w = widgetFactories[t]()
      expect(w.type).toBe(t)
      expect(w.props.kind).toBe(t)
    }
  })
})

// ---------------------------------------------------------------------------
// createBlankBlockDesign
// ---------------------------------------------------------------------------

describe('createBlankBlockDesign', () => {
  it('returns a design with version 4', () => {
    const design = createBlankBlockDesign()
    expect(design.version).toBe(4)
  })

  it('has empty sections array', () => {
    const design = createBlankBlockDesign()
    expect(design.sections).toEqual([])
  })

  it('has default global styles', () => {
    const design = createBlankBlockDesign()
    expect(design.globalStyles.backgroundColor).toBe('#ffffff')
    expect(design.globalStyles.maxWidth).toBe(1200)
  })
})

// ---------------------------------------------------------------------------
// Responsive resolution helpers
// ---------------------------------------------------------------------------

describe('getActiveWidgetProps', () => {
  const baseWidget: BlockWidget = {
    ...createTextWidget(),
    props: {
      kind: 'text' as const,
      content: 'Base text',
      fontFamily: 'sans-serif',
      fontSize: 48,
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: 0,
      color: '#000000',
      textAlign: 'center' as const,
      textShadow: '',
      bold: false,
      italic: false,
      underline: false,
    },
    responsiveOverrides: {
      tablet: {
        props: {
          kind: 'text' as const,
          fontSize: 32,
        } as Partial<TextWidgetProps>,
      },
      mobile: {
        props: {
          kind: 'text' as const,
          fontSize: 24,
        } as Partial<TextWidgetProps>,
      },
    },
  }

  it('returns base props for desktop', () => {
    const result = getActiveWidgetProps(baseWidget, 'desktop')
    expect((result as TextWidgetProps).fontSize).toBe(48)
    expect((result as TextWidgetProps).content).toBe('Base text')
  })

  it('merges tablet overrides over base for tablet', () => {
    const result = getActiveWidgetProps(baseWidget, 'tablet')
    expect((result as TextWidgetProps).fontSize).toBe(32)
    // non-overridden fields fall back to base
    expect((result as TextWidgetProps).content).toBe('Base text')
  })

  it('uses mobile overrides for mobile', () => {
    const result = getActiveWidgetProps(baseWidget, 'mobile')
    expect((result as TextWidgetProps).fontSize).toBe(24)
    expect((result as TextWidgetProps).content).toBe('Base text')
  })

  it('falls back through tablet then base when mobile has no override', () => {
    const widgetNoMobile: BlockWidget = {
      ...baseWidget,
      responsiveOverrides: {
        tablet: {
          props: {
            kind: 'text' as const,
            fontSize: 32,
          } as Partial<TextWidgetProps>,
        },
      },
    }
    const result = getActiveWidgetProps(widgetNoMobile, 'mobile')
    // should fall to tablet override
    expect((result as TextWidgetProps).fontSize).toBe(32)
    expect((result as TextWidgetProps).content).toBe('Base text')
  })

  it('falls back to base when neither mobile nor tablet have overrides', () => {
    const widgetNoOverrides: BlockWidget = {
      ...baseWidget,
      responsiveOverrides: undefined,
    }
    const result = getActiveWidgetProps(widgetNoOverrides, 'mobile')
    expect((result as TextWidgetProps).fontSize).toBe(48)
  })
})

describe('getActiveSectionSettings', () => {
  const baseSection: BlockSection = {
    ...createSection(),
    responsiveOverrides: {
      tablet: {
        minHeight: 200,
        padding: { top: 20, right: 10, bottom: 20, left: 10 },
      },
      mobile: {
        minHeight: 100,
      },
    },
  }

  it('returns base settings for desktop', () => {
    const result = getActiveSectionSettings(baseSection, 'desktop')
    expect(result.minHeight).toBe(0)
    expect(result.padding).toEqual({ top: 40, right: 20, bottom: 40, left: 20 })
  })

  it('merges tablet overrides for tablet', () => {
    const result = getActiveSectionSettings(baseSection, 'tablet')
    expect(result.minHeight).toBe(200)
    expect(result.padding).toEqual({ top: 20, right: 10, bottom: 20, left: 10 })
    // non-overridden fields persist
    expect(result.horizontalAlign).toBe('center')
  })

  it('merges mobile overrides for mobile', () => {
    const result = getActiveSectionSettings(baseSection, 'mobile')
    expect(result.minHeight).toBe(100)
  })

  it('falls back to tablet then base when mobile has no override', () => {
    const sectionNoMobile: BlockSection = {
      ...baseSection,
      responsiveOverrides: {
        tablet: {
          minHeight: 200,
        },
      },
    }
    const result = getActiveSectionSettings(sectionNoMobile, 'mobile')
    // should fall to tablet
    expect(result.minHeight).toBe(200)
  })

  it('falls back to base when no overrides exist', () => {
    const sectionNoOverrides: BlockSection = {
      ...baseSection,
      responsiveOverrides: undefined,
    }
    const result = getActiveSectionSettings(sectionNoOverrides, 'mobile')
    expect(result.minHeight).toBe(0)
  })
})

describe('getActiveColumnSettings', () => {
  const baseColumn: BlockColumn = {
    ...createColumn(50),
    responsiveOverrides: {
      tablet: {
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
      },
      mobile: {
        verticalAlign: 'center',
      },
    },
  }

  it('returns base settings for desktop', () => {
    const result = getActiveColumnSettings(baseColumn, 'desktop')
    expect(result.verticalAlign).toBe('top')
    expect(result.padding).toEqual(ZERO_SPACING)
  })

  it('merges tablet overrides for tablet', () => {
    const result = getActiveColumnSettings(baseColumn, 'tablet')
    expect(result.padding).toEqual({ top: 10, right: 10, bottom: 10, left: 10 })
    expect(result.verticalAlign).toBe('top')
  })

  it('merges mobile overrides for mobile', () => {
    const result = getActiveColumnSettings(baseColumn, 'mobile')
    expect(result.verticalAlign).toBe('center')
  })

  it('falls back to tablet then base when mobile has no override', () => {
    const colNoMobile: BlockColumn = {
      ...baseColumn,
      responsiveOverrides: {
        tablet: {
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
      },
    }
    const result = getActiveColumnSettings(colNoMobile, 'mobile')
    // should fall to tablet
    expect(result.padding).toEqual({ top: 10, right: 10, bottom: 10, left: 10 })
  })

  it('falls back to base when no overrides exist', () => {
    const colNoOverrides: BlockColumn = {
      ...baseColumn,
      responsiveOverrides: undefined,
    }
    const result = getActiveColumnSettings(colNoOverrides, 'mobile')
    expect(result.verticalAlign).toBe('top')
    expect(result.padding).toEqual(ZERO_SPACING)
  })
})
