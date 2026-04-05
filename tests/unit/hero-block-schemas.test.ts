import { describe, it, expect } from '@jest/globals'
import {
  heroBlockDesignSchema,
  spacingSchema,
  marginSchema,
  visibilitySchema,
  animationTypeSchema,
  animationSchema,
  textPropsSchema,
  imagePropsSchema,
  buttonPropsSchema,
  shapePropsSchema,
  dividerPropsSchema,
  spacerPropsSchema,
  iconPropsSchema,
  videoPropsSchema,
  countdownPropsSchema,
  socialProofPropsSchema,
  animatedBgPropsSchema,
  widgetPropsSchema,
  widgetSchema,
  widgetOverridesSchema,
  blockBackgroundSchema,
  columnSettingsSchema,
  columnSchema,
  sectionBackgroundSchema,
  sectionSettingsSchema,
  sectionSchema,
  globalStylesSchema,
  type ValidatedHeroBlockDesign,
} from '@/lib/hero-block-schemas'
import {
  createBlankBlockDesign,
  createSection,
  createTextWidget,
  createButtonWidget,
} from '@/lib/hero-block-defaults'

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

describe('spacingSchema', () => {
  it('validates valid spacing', () => {
    const result = spacingSchema.safeParse({ top: 10, right: 20, bottom: 30, left: 40 })
    expect(result.success).toBe(true)
  })

  it('rejects negative values', () => {
    const result = spacingSchema.safeParse({ top: -1, right: 0, bottom: 0, left: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects values above 500', () => {
    const result = spacingSchema.safeParse({ top: 501, right: 0, bottom: 0, left: 0 })
    expect(result.success).toBe(false)
  })
})

describe('marginSchema', () => {
  it('validates valid margin', () => {
    const result = marginSchema.safeParse({ top: 0, bottom: 100 })
    expect(result.success).toBe(true)
  })

  it('rejects values above 500', () => {
    const result = marginSchema.safeParse({ top: 600, bottom: 0 })
    expect(result.success).toBe(false)
  })
})

describe('visibilitySchema', () => {
  it('validates valid visibility', () => {
    const result = visibilitySchema.safeParse({ desktop: true, tablet: false, mobile: true })
    expect(result.success).toBe(true)
  })

  it('rejects non-boolean values', () => {
    const result = visibilitySchema.safeParse({ desktop: 'yes', tablet: false, mobile: true })
    expect(result.success).toBe(false)
  })
})

describe('animationTypeSchema', () => {
  it('validates known animation types', () => {
    const types = ['fadeIn', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'scaleIn', 'bounce', 'none']
    for (const t of types) {
      expect(animationTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects unknown animation type', () => {
    expect(animationTypeSchema.safeParse('spin').success).toBe(false)
  })
})

describe('animationSchema', () => {
  it('validates valid animation', () => {
    const result = animationSchema.safeParse({ type: 'fadeIn', duration: 400, delay: 0 })
    expect(result.success).toBe(true)
  })

  it('rejects duration above 10000', () => {
    const result = animationSchema.safeParse({ type: 'fadeIn', duration: 10001, delay: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects delay above 10000', () => {
    const result = animationSchema.safeParse({ type: 'fadeIn', duration: 400, delay: 10001 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Widget props schemas
// ---------------------------------------------------------------------------

describe('textPropsSchema', () => {
  it('validates a default text widget props', () => {
    const widget = createTextWidget()
    const result = textPropsSchema.safeParse(widget.props)
    expect(result.success).toBe(true)
  })

  it('rejects content longer than 5000 chars', () => {
    const widget = createTextWidget()
    const props = { ...widget.props, content: 'x'.repeat(5001) }
    const result = textPropsSchema.safeParse(props)
    expect(result.success).toBe(false)
  })

  it('rejects fontSize out of range', () => {
    const widget = createTextWidget()
    const result = textPropsSchema.safeParse({ ...widget.props, fontSize: 7 })
    expect(result.success).toBe(false)
  })

  it('rejects fontWeight out of range', () => {
    const result = textPropsSchema.safeParse({
      ...createTextWidget().props,
      fontWeight: 1000,
    })
    expect(result.success).toBe(false)
  })
})

describe('imagePropsSchema', () => {
  it('validates a default image widget props', () => {
    const result = imagePropsSchema.safeParse({
      kind: 'image',
      src: '',
      alt: '',
      objectFit: 'cover',
      borderRadius: 0,
      opacity: 1,
    })
    expect(result.success).toBe(true)
  })

  it('rejects opacity above 1', () => {
    const result = imagePropsSchema.safeParse({
      kind: 'image',
      src: '',
      alt: '',
      objectFit: 'cover',
      borderRadius: 0,
      opacity: 1.5,
    })
    expect(result.success).toBe(false)
  })
})

describe('buttonPropsSchema', () => {
  it('validates a default button widget props', () => {
    const result = buttonPropsSchema.safeParse(createButtonWidget().props)
    expect(result.success).toBe(true)
  })

  it('rejects borderRadius above 500', () => {
    const result = buttonPropsSchema.safeParse({
      ...createButtonWidget().props,
      borderRadius: 501,
    })
    expect(result.success).toBe(false)
  })
})

describe('shapePropsSchema', () => {
  it('validates valid shape props', () => {
    const result = shapePropsSchema.safeParse({
      kind: 'shape',
      shapeType: 'rectangle',
      fillColor: '#E5E7EB',
      borderWidth: 0,
      borderColor: '#000000',
      borderRadius: 0,
      opacity: 1,
    })
    expect(result.success).toBe(true)
  })
})

describe('dividerPropsSchema', () => {
  it('validates valid divider props', () => {
    const result = dividerPropsSchema.safeParse({
      kind: 'divider',
      orientation: 'horizontal',
      thickness: 2,
      color: '#D1D5DB',
      style: 'solid',
    })
    expect(result.success).toBe(true)
  })

  it('rejects thickness above 50', () => {
    const result = dividerPropsSchema.safeParse({
      kind: 'divider',
      orientation: 'horizontal',
      thickness: 51,
      color: '#D1D5DB',
      style: 'solid',
    })
    expect(result.success).toBe(false)
  })
})

describe('spacerPropsSchema', () => {
  it('validates valid spacer props', () => {
    const result = spacerPropsSchema.safeParse({ kind: 'spacer', height: 40 })
    expect(result.success).toBe(true)
  })

  it('rejects height above 500', () => {
    const result = spacerPropsSchema.safeParse({ kind: 'spacer', height: 501 })
    expect(result.success).toBe(false)
  })
})

describe('iconPropsSchema', () => {
  it('validates valid icon props', () => {
    const result = iconPropsSchema.safeParse({
      kind: 'icon',
      iconName: 'Star',
      size: 48,
      color: '#000000',
    })
    expect(result.success).toBe(true)
  })

  it('rejects size above 512', () => {
    const result = iconPropsSchema.safeParse({
      kind: 'icon',
      iconName: 'Star',
      size: 513,
      color: '#000000',
    })
    expect(result.success).toBe(false)
  })
})

describe('videoPropsSchema', () => {
  it('validates valid video props', () => {
    const result = videoPropsSchema.safeParse({
      kind: 'video',
      videoUrl: '',
      autoplay: true,
      muted: true,
      loop: true,
      posterImage: '',
    })
    expect(result.success).toBe(true)
  })
})

describe('countdownPropsSchema', () => {
  it('validates valid countdown props', () => {
    const result = countdownPropsSchema.safeParse({
      kind: 'countdown',
      targetDate: '2026-12-31T00:00:00.000Z',
      showDays: true,
      showHours: true,
      showMinutes: true,
      showSeconds: true,
      fontSize: 36,
      color: '#000000',
      separatorColor: '#666666',
    })
    expect(result.success).toBe(true)
  })

  it('rejects fontSize above 200', () => {
    const result = countdownPropsSchema.safeParse({
      kind: 'countdown',
      targetDate: '2026-12-31T00:00:00.000Z',
      showDays: true,
      showHours: true,
      showMinutes: true,
      showSeconds: true,
      fontSize: 201,
      color: '#000000',
      separatorColor: '#666666',
    })
    expect(result.success).toBe(false)
  })
})

describe('socialProofPropsSchema', () => {
  it('validates valid social proof props', () => {
    const result = socialProofPropsSchema.safeParse({
      kind: 'social-proof',
      presetType: 'orders',
      text: 'Orders Served',
      number: 10000,
      iconName: 'ShoppingBag',
      badgeStyle: 'pill',
      backgroundColor: '#F3F4F6',
      textColor: '#111827',
    })
    expect(result.success).toBe(true)
  })

  it('rejects number above 99999999', () => {
    const result = socialProofPropsSchema.safeParse({
      kind: 'social-proof',
      presetType: 'orders',
      text: 'Orders Served',
      number: 100000000,
      iconName: 'ShoppingBag',
      badgeStyle: 'pill',
      backgroundColor: '#F3F4F6',
      textColor: '#111827',
    })
    expect(result.success).toBe(false)
  })
})

describe('animatedBgPropsSchema', () => {
  it('validates valid animated bg props', () => {
    const result = animatedBgPropsSchema.safeParse({
      kind: 'animated-bg',
      gradientType: 'linear',
      gradientColors: ['#667eea', '#764ba2'],
      gradientAngle: 135,
      patternType: 'none',
      patternOpacity: 0.1,
      parallax: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects more than 10 gradient colors', () => {
    const result = animatedBgPropsSchema.safeParse({
      kind: 'animated-bg',
      gradientType: 'linear',
      gradientColors: Array(11).fill('#000000'),
      gradientAngle: 135,
      patternType: 'none',
      patternOpacity: 0.1,
      parallax: false,
    })
    expect(result.success).toBe(false)
  })

  it('rejects gradientAngle above 360', () => {
    const result = animatedBgPropsSchema.safeParse({
      kind: 'animated-bg',
      gradientType: 'linear',
      gradientColors: ['#000'],
      gradientAngle: 361,
      patternType: 'none',
      patternOpacity: 0.1,
      parallax: false,
    })
    expect(result.success).toBe(false)
  })
})

describe('widgetPropsSchema', () => {
  it('discriminates by kind for text', () => {
    const result = widgetPropsSchema.safeParse(createTextWidget().props)
    expect(result.success).toBe(true)
  })

  it('discriminates by kind for button', () => {
    const result = widgetPropsSchema.safeParse(createButtonWidget().props)
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Widget, column, section schemas
// ---------------------------------------------------------------------------

describe('widgetOverridesSchema', () => {
  it('validates valid overrides', () => {
    const result = widgetOverridesSchema.safeParse({
      alignment: 'left',
      width: '50',
      margin: { top: 10, bottom: 10 },
      padding: { top: 5, right: 5, bottom: 5, left: 5 },
    })
    expect(result.success).toBe(true)
  })

  it('allows empty overrides', () => {
    const result = widgetOverridesSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe('widgetSchema', () => {
  it('validates a default text widget', () => {
    const widget = createTextWidget()
    const result = widgetSchema.safeParse(widget)
    expect(result.success).toBe(true)
  })

  it('validates a default button widget', () => {
    const widget = createButtonWidget()
    const result = widgetSchema.safeParse(widget)
    expect(result.success).toBe(true)
  })

  it('validates responsive overrides on widgets', () => {
    const widget = {
      ...createTextWidget(),
      responsiveOverrides: {
        tablet: {
          alignment: 'left' as const,
          width: '100',
        },
        mobile: {
          alignment: 'center' as const,
        },
      },
    }
    const result = widgetSchema.safeParse(widget)
    expect(result.success).toBe(true)
  })

  it('rejects label longer than 100', () => {
    const widget = { ...createTextWidget(), label: 'x'.repeat(101) }
    const result = widgetSchema.safeParse(widget)
    expect(result.success).toBe(false)
  })
})

describe('blockBackgroundSchema', () => {
  it('validates none background', () => {
    const result = blockBackgroundSchema.safeParse({ type: 'none' })
    expect(result.success).toBe(true)
  })

  it('validates color background', () => {
    const result = blockBackgroundSchema.safeParse({ type: 'color', color: '#ff0000' })
    expect(result.success).toBe(true)
  })

  it('validates image background', () => {
    const result = blockBackgroundSchema.safeParse({
      type: 'image',
      image: { url: 'https://example.com/bg.jpg', opacity: 0.8, objectFit: 'cover' },
    })
    expect(result.success).toBe(true)
  })

  it('validates gradient background', () => {
    const result = blockBackgroundSchema.safeParse({
      type: 'gradient',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid type', () => {
    const result = blockBackgroundSchema.safeParse({ type: 'video' })
    expect(result.success).toBe(false)
  })

  it('rejects image opacity above 1', () => {
    const result = blockBackgroundSchema.safeParse({
      type: 'image',
      image: { url: 'https://example.com/bg.jpg', opacity: 1.5, objectFit: 'cover' },
    })
    expect(result.success).toBe(false)
  })
})

describe('columnSettingsSchema', () => {
  it('validates default column settings', () => {
    const result = columnSettingsSchema.safeParse({
      verticalAlign: 'top',
      horizontalAlign: 'left',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      background: { type: 'none' },
      borderRadius: 0,
    })
    expect(result.success).toBe(true)
  })

  it('validates column settings with color background', () => {
    const result = columnSettingsSchema.safeParse({
      verticalAlign: 'top',
      horizontalAlign: 'left',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      background: { type: 'color', color: '#ff0000' },
      borderRadius: 0,
    })
    expect(result.success).toBe(true)
  })

  it('validates column settings with image background', () => {
    const result = columnSettingsSchema.safeParse({
      verticalAlign: 'top',
      horizontalAlign: 'left',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      background: {
        type: 'image',
        image: { url: 'https://example.com/bg.jpg', opacity: 0.8, objectFit: 'cover' },
      },
      borderRadius: 0,
    })
    expect(result.success).toBe(true)
  })

  it('validates column settings with gradient background', () => {
    const result = columnSettingsSchema.safeParse({
      verticalAlign: 'top',
      horizontalAlign: 'left',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      background: {
        type: 'gradient',
        gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      },
      borderRadius: 0,
    })
    expect(result.success).toBe(true)
  })

  it('rejects borderRadius above 500', () => {
    const result = columnSettingsSchema.safeParse({
      verticalAlign: 'top',
      horizontalAlign: 'left',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      background: { type: 'none' },
      borderRadius: 501,
    })
    expect(result.success).toBe(false)
  })
})

describe('columnSchema', () => {
  it('validates a default column', () => {
    const section = createSection()
    const result = columnSchema.safeParse(section.columns[0])
    expect(result.success).toBe(true)
  })

  it('rejects more than 20 widgets', () => {
    const section = createSection()
    const col = section.columns[0]
    col.widgets = Array.from({ length: 21 }, () => createTextWidget())
    const result = columnSchema.safeParse(col)
    expect(result.success).toBe(false)
  })

  it('rejects width above 100', () => {
    const section = createSection()
    const col = { ...section.columns[0], width: 101 }
    const result = columnSchema.safeParse(col)
    expect(result.success).toBe(false)
  })
})

describe('sectionBackgroundSchema', () => {
  it('validates color background', () => {
    const result = sectionBackgroundSchema.safeParse({ type: 'color', color: '#ffffff' })
    expect(result.success).toBe(true)
  })

  it('validates gradient background', () => {
    const result = sectionBackgroundSchema.safeParse({
      type: 'gradient',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    })
    expect(result.success).toBe(true)
  })
})

describe('sectionSettingsSchema', () => {
  it('validates default section settings', () => {
    const section = createSection()
    const result = sectionSettingsSchema.safeParse(section.settings)
    expect(result.success).toBe(true)
  })

  it('rejects minHeight above 2000', () => {
    const section = createSection()
    const result = sectionSettingsSchema.safeParse({
      ...section.settings,
      minHeight: 2001,
    })
    expect(result.success).toBe(false)
  })
})

describe('sectionSchema', () => {
  it('validates a default section', () => {
    const section = createSection()
    const result = sectionSchema.safeParse(section)
    expect(result.success).toBe(true)
  })

  it('rejects more than 6 columns', () => {
    const section = createSection()
    section.columns = Array.from({ length: 7 }, () => section.columns[0])
    const result = sectionSchema.safeParse(section)
    expect(result.success).toBe(false)
  })

  it('requires at least 1 column', () => {
    const section = createSection()
    section.columns = []
    const result = sectionSchema.safeParse(section)
    expect(result.success).toBe(false)
  })

  it('rejects label longer than 100', () => {
    const section = { ...createSection(), label: 'x'.repeat(101) }
    const result = sectionSchema.safeParse(section)
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Global styles
// ---------------------------------------------------------------------------

describe('globalStylesSchema', () => {
  it('validates default global styles', () => {
    const result = globalStylesSchema.safeParse({
      backgroundColor: '#ffffff',
      maxWidth: 1200,
    })
    expect(result.success).toBe(true)
  })

  it('rejects maxWidth below 320', () => {
    const result = globalStylesSchema.safeParse({
      backgroundColor: '#ffffff',
      maxWidth: 319,
    })
    expect(result.success).toBe(false)
  })

  it('rejects maxWidth above 2560', () => {
    const result = globalStylesSchema.safeParse({
      backgroundColor: '#ffffff',
      maxWidth: 2561,
    })
    expect(result.success).toBe(false)
  })

  it('allows optional backgroundImage', () => {
    const result = globalStylesSchema.safeParse({
      backgroundColor: '#ffffff',
      backgroundImage: 'https://example.com/bg.jpg',
      maxWidth: 1200,
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Top-level design schema
// ---------------------------------------------------------------------------

describe('heroBlockDesignSchema', () => {
  it('validates a blank design from createBlankBlockDesign()', () => {
    const design = createBlankBlockDesign()
    const result = heroBlockDesignSchema.safeParse(design)
    expect(result.success).toBe(true)
  })

  it('validates a design with sections and widgets', () => {
    const design = createBlankBlockDesign()
    const section = createSection([50, 50])
    section.columns[0].widgets.push(createTextWidget())
    section.columns[1].widgets.push(createButtonWidget())
    design.sections.push(section)
    const result = heroBlockDesignSchema.safeParse(design)
    expect(result.success).toBe(true)
  })

  it('rejects version !== 4', () => {
    const design = { ...createBlankBlockDesign(), version: 3 }
    const result = heroBlockDesignSchema.safeParse(design)
    expect(result.success).toBe(false)
  })

  it('rejects more than 10 sections', () => {
    const design = createBlankBlockDesign()
    design.sections = Array.from({ length: 11 }, () => createSection())
    const result = heroBlockDesignSchema.safeParse(design)
    expect(result.success).toBe(false)
  })

  it('rejects CSS injection in colors (<script>)', () => {
    const design = createBlankBlockDesign()
    design.globalStyles.backgroundColor = '<script>alert("xss")</script>'
    const result = heroBlockDesignSchema.safeParse(design)
    expect(result.success).toBe(false)
  })

  it('rejects more than 6 columns in a section', () => {
    const design = createBlankBlockDesign()
    const section = createSection()
    section.columns = Array.from({ length: 7 }, () => section.columns[0])
    design.sections.push(section)
    const result = heroBlockDesignSchema.safeParse(design)
    expect(result.success).toBe(false)
  })

  it('rejects more than 20 widgets per column', () => {
    const design = createBlankBlockDesign()
    const section = createSection()
    section.columns[0].widgets = Array.from({ length: 21 }, () => createTextWidget())
    design.sections.push(section)
    const result = heroBlockDesignSchema.safeParse(design)
    expect(result.success).toBe(false)
  })

  it('validates responsive overrides on widgets', () => {
    const design = createBlankBlockDesign()
    const section = createSection()
    const widget = {
      ...createTextWidget(),
      responsiveOverrides: {
        tablet: {
          alignment: 'left' as const,
          width: '100',
        },
        mobile: {
          alignment: 'center' as const,
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
      },
    }
    section.columns[0].widgets.push(widget)
    design.sections.push(section)
    const result = heroBlockDesignSchema.safeParse(design)
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CSS injection guard
// ---------------------------------------------------------------------------

describe('CSS injection guards', () => {
  it('rejects angle brackets in color strings at widget level', () => {
    const widget = createTextWidget()
    const props = { ...widget.props, color: '<img onerror=alert(1)>' }
    const result = textPropsSchema.safeParse(props)
    expect(result.success).toBe(false)
  })

  it('rejects curly braces in color strings', () => {
    const widget = createTextWidget()
    const props = { ...widget.props, color: 'red; } .evil { color: green' }
    const result = textPropsSchema.safeParse(props)
    expect(result.success).toBe(false)
  })

  it('rejects quotes in color strings', () => {
    const widget = createButtonWidget()
    const props = { ...widget.props, backgroundColor: 'red"; alert("xss")' }
    const result = buttonPropsSchema.safeParse(props)
    expect(result.success).toBe(false)
  })

  it('rejects semicolons in color strings', () => {
    const widget = createButtonWidget()
    const props = { ...widget.props, textColor: 'red; background: url(evil)' }
    const result = buttonPropsSchema.safeParse(props)
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

describe('ValidatedHeroBlockDesign type', () => {
  it('type is assignable from parse result', () => {
    const design = createBlankBlockDesign()
    const result = heroBlockDesignSchema.parse(design)
    // TypeScript compile-time check — if this compiles, the type is correct
    const typed: ValidatedHeroBlockDesign = result
    expect(typed.version).toBe(4)
  })
})
