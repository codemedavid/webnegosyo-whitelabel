/**
 * Branding Studio ↔ storefront pack settings.
 *
 * The Studio edits a flat draft keyed by tenant column, but a pack's settings
 * live in one jsonb column (`storefront_pack_settings`, keyed by pack). Each
 * setting is exposed to the Studio as a virtual field id —
 * `storefront_pack_settings.<pack>.<key>` — so the existing cascade, inherit
 * labels and "is set" logic work unchanged, and is folded back into the whole
 * column value for publishing and for the live preview (whose tenant merge is
 * a shallow spread, so it must always receive the whole object).
 */
import type { z } from 'zod'
import type { BrandingField, BrandingSection } from '@/lib/branding-registry'
import { STOREFRONT_PACKS, type StorefrontPackId } from '@/lib/storefront-packs'

const SETTINGS_COLUMN = 'storefront_pack_settings'
const PREFIX = `${SETTINGS_COLUMN}.`

type ValueBag = Record<string, unknown> | null | undefined
type PackSettingsObject = Record<string, Record<string, unknown>>

export function packFieldId(packId: StorefrontPackId, key: string): string {
  return `${PREFIX}${packId}.${key}`
}

export function isPackFieldId(fieldId: string): boolean {
  return fieldId.startsWith(PREFIX)
}

function parsePackFieldId(fieldId: string): { packId: string; key: string } | null {
  if (!isPackFieldId(fieldId)) return null
  const [packId, key] = fieldId.slice(PREFIX.length).split('.')
  return packId && key ? { packId, key } : null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const PACK_IDS = new Set<string>(STOREFRONT_PACKS.map((pack) => pack.id))

/** The saved settings, restricted to registered packs (the save schema is strict). */
function savedPackSettings(tenant: ValueBag): PackSettingsObject {
  const raw = tenant?.[SETTINGS_COLUMN]
  if (!isPlainObject(raw)) return {}
  const entries = Object.entries(raw).filter(([packId, value]) => PACK_IDS.has(packId) && isPlainObject(value))
  return Object.fromEntries(entries) as PackSettingsObject
}

/** Saved pack settings as virtual field values. Unset keys stay absent, so they read as defaults. */
export function flattenPackSettings(tenant: ValueBag): Record<string, unknown> {
  const flat: Record<string, unknown> = {}
  for (const [packId, settings] of Object.entries(savedPackSettings(tenant))) {
    for (const [key, value] of Object.entries(settings)) flat[`${PREFIX}${packId}.${key}`] = value
  }
  return flat
}

/**
 * The whole `storefront_pack_settings` value: saved settings with the draft's
 * virtual field edits on top. A cleared ('' / null) field is removed, so the
 * pack's default applies again.
 */
export function foldPackSettings(draft: ValueBag, tenant: ValueBag): PackSettingsObject {
  const folded: PackSettingsObject = Object.fromEntries(
    Object.entries(savedPackSettings(tenant)).map(([packId, settings]) => [packId, { ...settings }])
  )
  for (const [fieldId, value] of Object.entries(draft ?? {})) {
    const parsed = parsePackFieldId(fieldId)
    if (!parsed || !PACK_IDS.has(parsed.packId)) continue
    const next = { ...(folded[parsed.packId] ?? {}) }
    if (value === '' || value === null || value === undefined) delete next[parsed.key]
    else next[parsed.key] = value
    folded[parsed.packId] = next
  }
  return folded
}

/** The draft to stream to the preview: with the folded settings when pack fields were edited. */
export function withPackSettingsPreview<T extends Record<string, unknown>>(draft: T, tenant: ValueBag): T {
  if (!Object.keys(draft).some(isPackFieldId)) return draft
  return { ...draft, [SETTINGS_COLUMN]: foldPackSettings(draft, tenant) }
}

/** One Studio section per pack with settings, shown only while that pack is picked. */
export function packStudioSections(): BrandingSection[] {
  return STOREFRONT_PACKS.filter((pack) => pack.studioFields.length > 0).map((pack) => ({
    title: `${pack.name} settings`,
    fields: pack.studioFields.map(({ key, label }): BrandingField => {
      const fallback = (pack.settingsSchema.shape[key] as z.ZodType).parse(undefined)
      return {
        id: packFieldId(pack.id, key),
        label,
        type: typeof fallback === 'boolean' ? 'toggle' : 'text',
        default: fallback as string | boolean,
        placeholder: typeof fallback === 'string' ? fallback : undefined,
        columnBacked: true,
        showWhen: { fieldId: 'storefront_pack', values: [pack.id] },
      }
    }),
  }))
}
