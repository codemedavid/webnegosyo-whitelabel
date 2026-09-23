/**
 * Storefront packs — whole-site storefront designs.
 *
 * A pack owns the storefront's chrome and pages (home, menu) and may pin the
 * designs of other surfaces (e.g. its own checkout). It sits above the other
 * design tiers: theme tokens → component templates (card/header/cart/checkout)
 * → catalog page layouts (inside the legacy pack) → storefront pack.
 *
 * This module is plain (no 'use client') so server code, the Branding Studio
 * and zod validation can all import it. The pack *components* live in the
 * client registry, src/storefront/packs/registry.tsx.
 *
 * Adding a pack: add its id and definition here, its components under
 * src/storefront/packs/<id>/, and one entry in the client registry (a missing
 * entry is a compile error). No migration: the column is free text.
 */
import { z } from 'zod'
import { pickDesignId } from '@/lib/design-ids'

export const STOREFRONT_PACK_IDS = ['legacy'] as const
export type StorefrontPackId = (typeof STOREFRONT_PACK_IDS)[number]
export const DEFAULT_STOREFRONT_PACK: StorefrontPackId = 'legacy'

export interface StorefrontPackDefinition {
  id: StorefrontPackId
  name: string
  description: string
  /** Emoji shown in the Studio picker, like the other design registries. */
  preview: string
  /**
   * The pack's own settings, stored under its id in
   * `tenants.storefront_pack_settings`. Every field must carry a `.default()`
   * so a missing or invalid value falls back per field.
   */
  settingsSchema: z.ZodObject<z.ZodRawShape>
}

export const STOREFRONT_PACKS: StorefrontPackDefinition[] = [
  {
    id: 'legacy',
    name: 'Classic storefront',
    description: 'One menu page with your header, hero and catalog layout of choice.',
    preview: '🍽️',
    settingsSchema: z.object({}),
  },
]

interface StorefrontPackTenant {
  storefront_pack?: unknown
  storefront_pack_settings?: unknown
}

/** The tenant's pack. Unknown, blank and missing values land on the default. */
export function resolveStorefrontPack(tenant: StorefrontPackTenant | null | undefined): StorefrontPackId {
  return pickDesignId(tenant?.storefront_pack, STOREFRONT_PACK_IDS, DEFAULT_STOREFRONT_PACK)
}

export function getStorefrontPack(id: StorefrontPackId): StorefrontPackDefinition {
  return STOREFRONT_PACKS.find((pack) => pack.id === id) ?? STOREFRONT_PACKS[0]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse stored settings field by field: a valid field is kept, an invalid or
 * missing one takes its default, and unknown keys are dropped. One bad value
 * never throws away the rest of a merchant's settings.
 */
export function readSettingsWithFallback<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  raw: unknown
): z.output<z.ZodObject<Shape>> {
  const source = isPlainObject(raw) ? raw : {}
  const entries = Object.entries(schema.shape).map(([key, field]) => {
    const parsed = (field as z.ZodType).safeParse(source[key])
    return [key, parsed.success ? parsed.data : (field as z.ZodType).parse(undefined)]
  })
  return Object.fromEntries(entries) as z.output<z.ZodObject<Shape>>
}

/** A pack's settings for this tenant, with defaults for anything unset or invalid. */
export function readPackSettings(tenant: StorefrontPackTenant | null | undefined, id: StorefrontPackId) {
  const all = isPlainObject(tenant?.storefront_pack_settings) ? tenant.storefront_pack_settings : {}
  return readSettingsWithFallback(getStorefrontPack(id).settingsSchema, all[id])
}

/**
 * Write-side validation for `tenants.storefront_pack_settings`: only registered
 * pack keys, each validated strictly by its own schema.
 */
export const storefrontPackSettingsSchema = z.strictObject(
  Object.fromEntries(STOREFRONT_PACKS.map((pack) => [pack.id, pack.settingsSchema.optional()]))
)
