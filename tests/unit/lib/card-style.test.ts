import {
  CARD_STYLE_FIELDS,
  readCardStyleSettings,
  resolveCardStyle,
  type CardStyle,
} from '@/lib/card-style'

const TEMPLATE_DEFAULTS: CardStyle = {
  imageRatio: 'portrait',
  imageFit: 'cover',
  addButton: 'pill',
  textAlign: 'start',
  description: 'hide',
  density: 'comfortable',
}

describe('readCardStyleSettings', () => {
  it('reads every knob off the tenant columns', () => {
    const settings = readCardStyleSettings({
      card_image_ratio: 'wide',
      card_image_fit: 'contain',
      card_add_button: 'bar',
      card_text_align: 'center',
      card_description: 'show',
      card_density: 'compact',
    })

    expect(settings).toEqual({
      imageRatio: 'wide',
      imageFit: 'contain',
      addButton: 'bar',
      textAlign: 'center',
      description: 'show',
      density: 'compact',
    })
  })

  it('reads a missing, null or unknown column as auto, so a bad value never breaks a card', () => {
    const settings = readCardStyleSettings({
      card_image_ratio: null,
      card_image_fit: 'stretch',
      card_add_button: 42,
    })

    expect(Object.values(settings).every((value) => value === 'auto')).toBe(true)
  })

  it('reads a null tenant as all auto', () => {
    expect(readCardStyleSettings(null).imageRatio).toBe('auto')
  })
})

describe('resolveCardStyle', () => {
  it('uses the template design when the merchant left every knob on auto', () => {
    expect(resolveCardStyle(undefined, TEMPLATE_DEFAULTS)).toEqual(TEMPLATE_DEFAULTS)
  })

  it('lets a merchant choice win over the template design, knob by knob', () => {
    const resolved = resolveCardStyle(
      { ...readCardStyleSettings(null), imageRatio: 'square', addButton: 'hidden' },
      TEMPLATE_DEFAULTS
    )

    expect(resolved).toEqual({ ...TEMPLATE_DEFAULTS, imageRatio: 'square', addButton: 'hidden' })
  })

  it('returns a new object and leaves the template defaults untouched', () => {
    const resolved = resolveCardStyle({ ...readCardStyleSettings(null), density: 'spacious' }, TEMPLATE_DEFAULTS)

    expect(resolved).not.toBe(TEMPLATE_DEFAULTS)
    expect(TEMPLATE_DEFAULTS.density).toBe('comfortable')
  })
})

describe('CARD_STYLE_FIELDS', () => {
  it('offers auto first on every knob, so "use the template design" is the default choice', () => {
    for (const field of CARD_STYLE_FIELDS) {
      expect(field.options[0]).toBe('auto')
    }
  })

  it('maps each knob to a card_* tenant column', () => {
    expect(CARD_STYLE_FIELDS.map((field) => field.column)).toEqual([
      'card_image_ratio',
      'card_image_fit',
      'card_add_button',
      'card_text_align',
      'card_description',
      'card_density',
    ])
  })
})

describe('card style on a phone', () => {
  it('reads a phone-only knob from mobile_overrides once the storefront overlays them', async () => {
    // The storefront tenant passes through useBrandingPreviewTenant, which
    // applies the saved mobile_overrides on a phone before getTenantBranding.
    const { applyMobileOverrides } = await import('@/lib/mobile-overrides')
    const { getTenantBranding } = await import('@/lib/branding-utils')
    const tenant = { card_image_fit: 'cover', mobile_overrides: { card_image_fit: 'contain' } }

    const phone = getTenantBranding(applyMobileOverrides(tenant, tenant.mobile_overrides))
    const desktop = getTenantBranding(tenant)

    expect(phone.cardStyle?.imageFit).toBe('contain')
    expect(desktop.cardStyle?.imageFit).toBe('cover')
  })
})
