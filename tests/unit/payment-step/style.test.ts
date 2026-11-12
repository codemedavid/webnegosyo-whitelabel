/**
 * The payment step look (`tenants.payment_step_style`): untrusted on read,
 * strict on write, and an empty column is exactly the pre-2026-11-12 step.
 */

import {
  DEFAULT_PAYMENT_STEP_OPTIONS,
  PAYMENT_STEP_STYLE_KEYS,
  isPageLikeLayout,
  paymentStepStyleSchema,
  readPaymentStepStyle,
} from '@/lib/payment-step/style'
import { resolvePaymentStepColors } from '@/lib/payment-step/colors'
import { PAYMENT_STEP_STYLE_SECTIONS } from '@/lib/payment-step/studio-sections'

describe('readPaymentStepStyle', () => {
  it('reads an empty or missing column as the standard bottom sheet with the upload box', () => {
    for (const tenant of [null, {}, { payment_step_style: {} }, { payment_step_style: 'oops' }, { payment_step_style: [] }]) {
      const style = readPaymentStepStyle(tenant as Record<string, unknown> | null)
      expect(style.options).toEqual({ layout: 'sheet', upload_design: 'classic', header_style: 'band', show_breakdown: true })
      expect(style.colors).toEqual({})
      expect(style.sampleImage).toBeNull()
    }
    expect(DEFAULT_PAYMENT_STEP_OPTIONS.layout).toBe('sheet')
  })

  it('keeps valid choices and colours, normalised', () => {
    const style = readPaymentStepStyle({
      payment_step_style: { layout: 'screen', upload_design: 'steps', header_style: 'plain', show_breakdown: false, band_color: '#ABC', accent: '#E4572E' },
    })
    expect(style.options).toEqual({ layout: 'screen', upload_design: 'steps', header_style: 'plain', show_breakdown: false })
    expect(style.colors).toEqual({ band_color: '#aabbcc', accent: '#e4572e' })
  })

  it('drops unknown keys, bad choices, non-hex colours and inherited keys', () => {
    const raw = Object.create({ layout: 'screen' }) as Record<string, unknown>
    Object.assign(raw, { upload_design: 'gallery', band_color: 'red; background:url(x)', show_breakdown: 'no', __proto__x: 1 })
    const style = readPaymentStepStyle({ payment_step_style: raw })
    expect(style.options).toEqual(DEFAULT_PAYMENT_STEP_OPTIONS)
    expect(style.colors).toEqual({})
  })

  it('accepts only an https example picture without credentials', () => {
    expect(readPaymentStepStyle({ payment_step_style: { sample_image: 'https://ik.imagekit.io/x/r.jpg' } }).sampleImage).toBe('https://ik.imagekit.io/x/r.jpg')
    for (const bad of ['http://x.com/r.jpg', 'javascript:alert(1)', 'https://u:p@x.com/r.jpg', `https://x.com/${'a'.repeat(700)}`, 'not a url']) {
      expect(readPaymentStepStyle({ payment_step_style: { sample_image: bad } }).sampleImage).toBeNull()
    }
  })
})

describe('paymentStepStyleSchema (Studio publish)', () => {
  it('accepts every setting the Studio offers', () => {
    expect(
      paymentStepStyleSchema.safeParse({
        layout: 'fullscreen', upload_design: 'reference', header_style: 'band', show_breakdown: true,
        band_color: '#112233', band_text: '#fff', button_color: '#000000', button_text: '#ffffff', accent: '#e4572e',
        sample_image: 'https://ik.imagekit.io/x/r.jpg',
      }).success,
    ).toBe(true)
  })

  it('refuses unknown keys, unlisted choices, css in a colour and a non-https picture', () => {
    for (const bad of [{ extra: 1 }, { layout: 'drawer' }, { accent: 'red' }, { band_color: '#fff;}' }, { sample_image: 'http://x.com/a.jpg' }]) {
      expect(paymentStepStyleSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('has a Studio field for every key, and a key for every Studio field', () => {
    const fieldKeys = PAYMENT_STEP_STYLE_SECTIONS.flatMap((section) => section.fields)
      .filter((field) => field.type !== 'note')
      .map((field) => field.id.replace('payment_step_style.', ''))
    expect([...fieldKeys].sort()).toEqual([...PAYMENT_STEP_STYLE_KEYS].sort())
  })
})

describe('resolvePaymentStepColors', () => {
  const palette = { accent: '#e4572e', accentText: '#ffffff', button: '#123456' }

  it('nothing set = the band and the Send button in the checkout button colour, as before', () => {
    const colors = resolvePaymentStepColors(palette, { colors: {} })
    expect(colors).toMatchObject({ band: '#123456', bandText: '#ffffff', button: '#123456', buttonText: '#ffffff', accent: '#e4572e' })
    expect(colors.accentVars).toBeNull()
    // No checkout button colour: the accent, as the old `palette.button ?? palette.accent`.
    expect(resolvePaymentStepColors({ ...palette, button: undefined }, { colors: {} }).band).toBe('#e4572e')
  })

  it('a colour set without its text gets readable text, not the checkout text', () => {
    const colors = resolvePaymentStepColors({ ...palette, accentText: '#ffffff' }, { colors: { band_color: '#fafafa', button_color: '#fefefe' } })
    expect(colors.bandText.toLowerCase()).not.toBe('#ffffff')
    expect(colors.buttonText.toLowerCase()).not.toBe('#ffffff')
  })

  it('an owner accent re-points the step’s --co-accent variables', () => {
    const colors = resolvePaymentStepColors(palette, { colors: { accent: '#00aa55' } })
    expect(colors.accent).toBe('#00aa55')
    expect(colors.accentVars).toMatchObject({ '--co-accent': '#00aa55' })
  })
})

describe('isPageLikeLayout', () => {
  it('only full screen and its own screen answer the Back button', () => {
    expect(['sheet', 'popup', 'fullscreen', 'screen'].map((layout) => isPageLikeLayout(layout as never))).toEqual([false, false, true, true])
  })
})
