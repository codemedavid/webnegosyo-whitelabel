/**
 * The Branding Studio edits a flat draft keyed by tenant column. A storefront
 * pack's settings live in ONE jsonb column, keyed by pack. This adapter lets
 * the Studio treat each pack setting as its own field (virtual id
 * `storefront_pack_settings.<pack>.<key>`) and folds them back into the whole
 * column value for saving and for the live preview.
 */
import {
  flattenPackSettings,
  foldPackSettings,
  isPackFieldId,
  packFieldId,
  packStudioSections,
  withPackSettingsPreview,
} from '@/lib/storefront-pack-studio'
import { brandingSchema } from '@/lib/branding-service'
import { BRANDING_FIELD_INDEX, BRANDING_SURFACES, buildPublishPayload } from '@/lib/branding-registry'
import { getPreviewTarget } from '@/components/admin/branding-studio/preview-routes'

const TITLE = packFieldId('bitespeed', 'best_sellers_title')
const SHOW_STEPS = packFieldId('bitespeed', 'show_how_it_works')

describe('pack field ids', () => {
  it('are namespaced by pack and recognisable', () => {
    expect(TITLE).toBe('storefront_pack_settings.bitespeed.best_sellers_title')
    expect(isPackFieldId(TITLE)).toBe(true)
    expect(isPackFieldId('storefront_pack')).toBe(false)
    expect(isPackFieldId('primary_color')).toBe(false)
  })
})

describe('flattenPackSettings', () => {
  it('exposes only what the merchant saved, so unset fields still read as defaults', () => {
    const flat = flattenPackSettings({ storefront_pack_settings: { bitespeed: { best_sellers_title: 'Fan favorites' } } })
    expect(flat).toEqual({ [TITLE]: 'Fan favorites' })
  })

  it('ignores missing, malformed and unknown-pack settings', () => {
    expect(flattenPackSettings(null)).toEqual({})
    expect(flattenPackSettings({ storefront_pack_settings: 'nope' })).toEqual({})
    expect(flattenPackSettings({ storefront_pack_settings: { garbage: { a: 1 } } })).toEqual({})
  })
})

describe('foldPackSettings', () => {
  const saved = { storefront_pack_settings: { bitespeed: { best_sellers_title: 'Old', step_1_title: 'Pick' } } }

  it('overlays draft edits on the saved settings, keeping untouched keys', () => {
    expect(foldPackSettings({ [TITLE]: 'New', [SHOW_STEPS]: false }, saved)).toEqual({
      bitespeed: { best_sellers_title: 'New', step_1_title: 'Pick', show_how_it_works: false },
    })
  })

  it('drops a cleared field so it falls back to the pack default', () => {
    expect(foldPackSettings({ [TITLE]: '' }, saved)).toEqual({ bitespeed: { step_1_title: 'Pick' } })
  })

  it('never carries unknown packs, so the strict save schema accepts the result', () => {
    const folded = foldPackSettings({}, { storefront_pack_settings: { garbage: { x: 1 }, ...saved.storefront_pack_settings } })
    expect(Object.keys(folded)).toEqual(['bitespeed'])
  })
})

describe('the Site layout surface', () => {
  const surface = BRANDING_SURFACES.find((s) => s.id === 'layout')

  it('offers the pack picker, editing the real column even on the mobile tab', () => {
    const picker = BRANDING_FIELD_INDEX['storefront_pack']
    expect(picker.options).toEqual(['legacy', 'bitespeed'])
    expect(picker.default).toBe('legacy')
    expect(picker.columnBacked).toBe(true)
    expect(surface?.sections.flatMap((section) => section.fields).map((field) => field.id)).toContain('storefront_pack')
  })

  it("shows each pack's own settings only while that pack is picked", () => {
    const sections = packStudioSections()
    const bitespeed = sections.find((section) => section.fields.some((field) => field.id === TITLE))
    for (const field of bitespeed?.fields ?? []) {
      expect(field.showWhen).toEqual({ fieldId: 'storefront_pack', values: ['bitespeed'] })
      expect(field.columnBacked).toBe(true)
    }
    expect(BRANDING_FIELD_INDEX[TITLE]).toMatchObject({ type: 'text', default: 'Best Sellers' })
    expect(BRANDING_FIELD_INDEX[SHOW_STEPS]).toMatchObject({ type: 'toggle', default: true })
  })

  it('previews on the tenant home, where a pack draws its home page', () => {
    expect(getPreviewTarget('shop', 'layout')).toEqual({ path: '/shop' })
  })
})

describe('publishing', () => {
  it('saves the folded settings object and never the virtual field ids', () => {
    const payload = buildPublishPayload(
      { storefront_pack: 'bitespeed', [TITLE]: 'Fan favorites' },
      { primary_color: '#111111', secondary_color: '#666666' }
    )
    expect(payload.storefront_pack).toBe('bitespeed')
    expect(payload.storefront_pack_settings).toEqual({ bitespeed: { best_sellers_title: 'Fan favorites' } })
    expect(Object.keys(payload).some(isPackFieldId)).toBe(false)
    expect(brandingSchema.safeParse(payload).success).toBe(true)
  })
})

describe('withPackSettingsPreview', () => {
  it('adds the folded settings to a draft that edits pack fields, for the live preview', () => {
    const draft = { [TITLE]: 'Fan favorites' }
    expect(withPackSettingsPreview(draft, {}).storefront_pack_settings).toEqual({ bitespeed: { best_sellers_title: 'Fan favorites' } })
  })

  it('returns a draft without pack edits unchanged', () => {
    const draft = { primary_color: '#000000' }
    expect(withPackSettingsPreview(draft, {})).toBe(draft)
  })
})
