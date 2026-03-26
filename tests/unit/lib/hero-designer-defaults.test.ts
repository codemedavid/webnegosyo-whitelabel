import {
  getActiveProps,
  hasPropsOverride,
  migrateDesign,
  createTextElement,
  createBlankDesign,
} from '@/lib/hero-designer-defaults'
import type { TextProps, HeroDesign, HeroElement } from '@/types/hero-designer'

describe('getActiveProps', () => {
  it('returns props for desktop', () => {
    const el = createTextElement()
    const result = getActiveProps(el, 'desktop')
    expect(result).toBe(el.props)
  })

  it('returns tabletProps for tablet when set', () => {
    const el = createTextElement()
    el.tabletProps = { ...el.props, kind: 'text', fontSize: 36 } as TextProps
    const result = getActiveProps(el, 'tablet')
    expect(result).toBe(el.tabletProps)
  })

  it('falls back to props for tablet when tabletProps is undefined', () => {
    const el = createTextElement()
    el.tabletProps = undefined
    const result = getActiveProps(el, 'tablet')
    expect(result).toBe(el.props)
  })

  it('returns mobileProps for mobile when set', () => {
    const el = createTextElement()
    const result = getActiveProps(el, 'mobile')
    expect(result).toBe(el.mobileProps)
  })

  it('falls back to tabletProps for mobile when mobileProps is undefined', () => {
    const el = createTextElement()
    el.mobileProps = undefined
    el.tabletProps = { ...el.props, kind: 'text', fontSize: 36 } as TextProps
    const result = getActiveProps(el, 'mobile')
    expect(result).toBe(el.tabletProps)
  })

  it('falls back to props for mobile when both mobileProps and tabletProps are undefined', () => {
    const el = createTextElement()
    el.mobileProps = undefined
    el.tabletProps = undefined
    const result = getActiveProps(el, 'mobile')
    expect(result).toBe(el.props)
  })
})

describe('hasPropsOverride', () => {
  it('returns false for desktop', () => {
    const el = createTextElement()
    expect(hasPropsOverride(el, 'desktop')).toBe(false)
  })

  it('returns true for tablet when tabletProps is set', () => {
    const el = createTextElement()
    el.tabletProps = { ...el.props }
    expect(hasPropsOverride(el, 'tablet')).toBe(true)
  })

  it('returns false for tablet when tabletProps is undefined', () => {
    const el = createTextElement()
    el.tabletProps = undefined
    expect(hasPropsOverride(el, 'tablet')).toBe(false)
  })

  it('returns true for mobile when mobileProps is set', () => {
    const el = createTextElement()
    expect(hasPropsOverride(el, 'mobile')).toBe(true)
  })

  it('returns false for mobile when mobileProps is undefined', () => {
    const el = createTextElement()
    el.mobileProps = undefined
    expect(hasPropsOverride(el, 'mobile')).toBe(false)
  })
})

describe('createTextElement', () => {
  it('creates element with visibility object and tablet layout', () => {
    const el = createTextElement()
    expect(el.visibility).toEqual({ desktop: true, tablet: true, mobile: true })
    expect(el.tablet).toBeDefined()
    expect(el.tablet.x).toBeDefined()
    expect((el as Record<string, unknown>).visible).toBeUndefined()
  })
})

describe('createBlankDesign', () => {
  it('creates v3 design with tablet canvas', () => {
    const design = createBlankDesign()
    expect(design.version).toBe(3)
    expect(design.canvas.tablet).toEqual({ width: 768, height: 500 })
  })
})
