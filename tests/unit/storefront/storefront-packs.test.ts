/**
 * Storefront packs are whole-site designs (chrome + pages). A tenant's pack is
 * a free-text column, so every read must land on a real pack, and a pack's
 * settings are one JSON slice per pack whose bad or missing fields fall back
 * to that pack's defaults instead of breaking the storefront.
 */
import { z } from 'zod'
import {
  DEFAULT_STOREFRONT_PACK,
  STOREFRONT_PACKS,
  STOREFRONT_PACK_IDS,
  getStorefrontPack,
  readPackSettings,
  readSettingsWithFallback,
  resolveCheckoutTemplate,
  resolveStorefrontPack,
} from '@/lib/storefront-packs'
import { brandingSchema, ROLLOUT_DEPENDENT_FIELDS } from '@/lib/branding-service'
import { TENANT_STOREFRONT_SELECT } from '@/lib/queries/tenant-storefront-select'

describe('resolveStorefrontPack', () => {
  it.each([
    ['no tenant', null],
    ['no pack set', {}],
    ['a blank pack', { storefront_pack: '' }],
    ['an unknown pack', { storefront_pack: 'garbage' }],
    ['a non-string pack', { storefront_pack: 7 }],
  ])('falls back to the default pack for %s', (_label, tenant) => {
    expect(resolveStorefrontPack(tenant as never)).toBe(DEFAULT_STOREFRONT_PACK)
  })

  it('returns every registered pack as itself', () => {
    for (const id of STOREFRONT_PACK_IDS) expect(resolveStorefrontPack({ storefront_pack: id })).toBe(id)
  })

  it('keeps existing tenants on the legacy storefront', () => {
    expect(DEFAULT_STOREFRONT_PACK).toBe('legacy')
  })
})

describe('the pack registry', () => {
  it('describes every pack id exactly once, in id order', () => {
    expect(STOREFRONT_PACKS.map((pack) => pack.id)).toEqual([...STOREFRONT_PACK_IDS])
  })

  it('gives every pack a name, a description and settings that parse from nothing', () => {
    for (const pack of STOREFRONT_PACKS) {
      expect(pack.name).toBeTruthy()
      expect(pack.description).toBeTruthy()
      expect(() => pack.settingsSchema.parse({})).not.toThrow()
    }
  })
})

describe('readSettingsWithFallback', () => {
  const schema = z.object({
    title: z.string().max(10).default('Hello'),
    steps: z.number().int().min(1).default(3),
  })

  it('returns the defaults for a missing or non-object value', () => {
    for (const raw of [undefined, null, 'x', 5, []]) {
      expect(readSettingsWithFallback(schema, raw)).toEqual({ title: 'Hello', steps: 3 })
    }
  })

  it('keeps valid fields and defaults only the invalid ones', () => {
    expect(readSettingsWithFallback(schema, { title: 'Hi', steps: 0 })).toEqual({ title: 'Hi', steps: 3 })
    expect(readSettingsWithFallback(schema, { title: 'far too long a title', steps: 2 })).toEqual({ title: 'Hello', steps: 2 })
  })

  it('drops keys the pack does not define', () => {
    expect(readSettingsWithFallback(schema, { title: 'Hi', rogue: true })).toEqual({ title: 'Hi', steps: 3 })
  })
})

describe('saving a pack from the Branding Studio', () => {
  // Every Studio save carries the two required core colors.
  const save = (fields: Record<string, unknown>) =>
    brandingSchema.safeParse({ primary_color: '#111111', secondary_color: '#666666', ...fields }).success

  it('accepts a registered pack and rejects an unknown one', () => {
    expect(save({ storefront_pack: 'legacy' })).toBe(true)
    expect(save({ storefront_pack: 'garbage' })).toBe(false)
  })

  it('accepts settings keyed by a registered pack and rejects an unknown pack key', () => {
    expect(save({ storefront_pack_settings: { legacy: {} } })).toBe(true)
    expect(save({ storefront_pack_settings: { garbage: {} } })).toBe(false)
  })

  it('treats both columns as rollout-dependent so a database without them still saves the rest', () => {
    expect(ROLLOUT_DEPENDENT_FIELDS).toEqual(expect.arrayContaining(['storefront_pack', 'storefront_pack_settings']))
  })
})

describe('TENANT_STOREFRONT_SELECT', () => {
  const tokens = TENANT_STOREFRONT_SELECT.split(/[\s,]+/).filter(Boolean)

  it.each(['storefront_pack', 'storefront_pack_settings'])('projects %s', (column) => {
    expect(tokens).toContain(column)
  })
})

describe('resolveCheckoutTemplate', () => {
  it("uses the tenant's own checkout design on a pack that does not pin one", () => {
    expect(resolveCheckoutTemplate({ storefront_pack: 'legacy', checkout_template: 'wizard' })).toBe('wizard')
    expect(resolveCheckoutTemplate({ storefront_pack: 'legacy', checkout_template: 'garbage' })).toBe('classic')
    expect(resolveCheckoutTemplate(null)).toBe('classic')
  })

  it('uses the design a pack pins, whatever the tenant column says', () => {
    expect(resolveCheckoutTemplate({ storefront_pack: 'bitespeed', checkout_template: 'wizard' })).toBe('bitespeed')
  })
})

describe('the BiteSpeed pack', () => {
  it('goes straight to checkout from its pages instead of through a cart drawer', () => {
    expect(getStorefrontPack('bitespeed').checkoutEntry).toBe('direct')
  })

  it('has complete default settings and keeps a merchant’s valid ones', () => {
    const settings = readPackSettings(
      { storefront_pack_settings: { bitespeed: { best_sellers_title: 'Fan favorites', step_1_title: 'x'.repeat(99) } } },
      'bitespeed'
    )
    expect(settings.best_sellers_title).toBe('Fan favorites')
    expect(settings.step_1_title).toBe('Choose')
    expect(settings.show_how_it_works).toBe(true)
  })
})
