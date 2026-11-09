// ---------------------------------------------------------------------------
// The page "Look" in the Page Designer: the Branding Studio settings that
// paint a page (checkout colours, the Order status and Loyalty card looks,
// the page's store wording), edited beside the design.
//
// ONE store of truth: these are the very same tenant columns the Studio
// edits (`checkout_*_color`, `tracking_style`, `storefront_labels`), taken
// from the Studio's own registry, so the two editors can never disagree on
// what a field is, what it inherits or how it is validated. Edits are a list
// of changed field ids; a blank value clears the field (= follow the brand).
// ---------------------------------------------------------------------------

import { BRANDING_SURFACES, type BrandingField, type BrandingSection, type BrandingSurface } from '@/lib/branding-registry'
import { flattenJsonColumns, foldedJsonColumns, isJsonColumnFieldId, JSON_COLUMNS, withJsonColumnsPreview } from '@/lib/branding-studio/studio-columns'
import { mergeMobileOverrides, type OverrideMap } from '@/lib/mobile-overrides'
import { STOREFRONT_LABELS, type LabelScreen } from '@/lib/storefront-labels'

import type { PageId } from './types'

/** Field id → new value; '' = cleared (follow the brand / standard wording). */
export type LookChanges = Readonly<Record<string, string | boolean>>

/** What the editor sends to save a Look: the changes, and the saved values it started from. */
export interface PageLookInput {
  changes: LookChanges
  base: Readonly<Record<string, string | boolean | null>>
}

const LABEL_PREFIX = 'storefront_labels.'

function surfaceSections(id: BrandingSurface['id']): readonly BrandingSection[] {
  return BRANDING_SURFACES.find((s) => s.id === id)?.sections ?? []
}

const isLabelField = (field: BrandingField) => field.id.startsWith(LABEL_PREFIX)

/** A surface's sections without its wording (the page gathers its own) or chosen sections. */
function styleSections(id: BrandingSurface['id'], drop: readonly string[] = []): BrandingSection[] {
  return surfaceSections(id)
    .filter((section) => !drop.includes(section.title))
    .map((section) => ({ ...section, fields: section.fields.filter((f) => !isLabelField(f)) }))
    .filter((section) => section.fields.length > 0)
}

function labelSection(screens: readonly LabelScreen[]): BrandingSection {
  const fields = BRANDING_SURFACES.flatMap((s) => s.sections)
    .flatMap((section) => section.fields)
    .filter((field) => isLabelField(field) && screens.includes(STOREFRONT_LABELS[field.id.slice(LABEL_PREFIX.length) as keyof typeof STOREFRONT_LABELS]?.screen))
  // One field per label, however many Studio screens list it.
  const unique = [...new Map(fields.map((f) => [f.id, f])).values()]
  return { title: 'Store wording', fields: unique }
}

const prefixed = (prefix: string, sections: readonly BrandingSection[]): BrandingSection[] =>
  sections.map((section) => ({ ...section, title: `${prefix} · ${section.title}` }))

/** Whole-store settings the checkout and thank-you pages also paint from (status colours, the main button, fonts). */
const STORE_FIELD_IDS = ['button_primary_color', 'button_primary_text_color', 'success_color', 'warning_color', 'error_color', 'font_pair', 'card_roundness'] as const

function storeSection(): BrandingSection {
  const fields = surfaceSections('global')
    .flatMap((section) => section.fields)
    .filter((field) => (STORE_FIELD_IDS as readonly string[]).includes(field.id))
  return { title: 'Whole store · also changes your menu', fields }
}

/**
 * What the Look tab shows for each page, in order. The checkout's layout
 * picker is left out: a designed checkout has its own layout.
 */
export const PAGE_LOOK_SECTIONS: Readonly<Record<PageId, readonly BrandingSection[]>> = {
  checkout: [
    ...styleSections('checkout', ['Template']),
    ...prefixed('Loyalty card', styleSections('loyalty')),
    labelSection(['checkout', 'loyalty']),
    storeSection(),
  ],
  confirmation: [...styleSections('checkout', ['Template']), labelSection(['confirmation']), storeSection()],
  tracking: [...styleSections('tracking'), ...prefixed('Loyalty card', styleSections('loyalty')), labelSection(['tracking', 'loyalty'])],
}

const FIELD_IDS: Readonly<Record<PageId, ReadonlySet<string>>> = Object.fromEntries(
  Object.entries(PAGE_LOOK_SECTIONS).map(([page, sections]) => [
    page,
    new Set(sections.flatMap((s) => s.fields.filter((f) => f.type !== 'note').map((f) => f.id))),
  ]),
) as unknown as Record<PageId, ReadonlySet<string>>

/**
 * A Branding Studio phone override of a Look field, as a field id. The Look
 * tab only CLEARS one ("use this colour on phones too"): without that, a
 * phone colour set in the Studio would silently beat the edit on phones.
 */
export const MOBILE_PREFIX = 'mobile_overrides.'

/** The Look field a phone-override id clears (null for any other id). */
export function mobileOverrideField(fieldId: string): string | null {
  return fieldId.startsWith(MOBILE_PREFIX) ? fieldId.slice(MOBILE_PREFIX.length) : null
}

/** Whether the Look tab of `page` may change `fieldId`. */
export function isPageLookField(page: PageId, fieldId: string): boolean {
  const phone = mobileOverrideField(fieldId)
  // Phone overrides exist for real columns only (JSON-column looks are one look on every device).
  if (phone !== null) return FIELD_IDS[page].has(phone) && !isJsonColumnFieldId(phone)
  return FIELD_IDS[page].has(fieldId)
}

type Row = Readonly<Record<string, unknown>>

const overridesOf = (row: Row): OverrideMap => {
  const value = row.mobile_overrides
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as OverrideMap) : {}
}

/** The saved values the Look tab reads: real columns, every JSON column flattened into field ids, and the phone overrides. */
export function lookValues(row: Row): Record<string, unknown> {
  const phone = Object.fromEntries(Object.entries(overridesOf(row)).map(([key, value]) => [`${MOBILE_PREFIX}${key}`, value]))
  return { ...row, ...flattenJsonColumns(row as Record<string, unknown>), ...phone }
}

/** The phone overrides cleared by `changes` ({} when none). */
function clearedPhoneOverrides(changes: LookChanges): OverrideMap {
  return Object.fromEntries(
    Object.keys(changes)
      .map(mobileOverrideField)
      .filter((field): field is string => field !== null)
      .map((field) => [field, '']),
  )
}

/** The store row as it will look with `changes` saved (for the live canvas). */
export function previewLookRow(row: Row, changes: LookChanges): Record<string, unknown> {
  const real = Object.fromEntries(
    Object.entries(changes)
      .filter(([id]) => !isJsonColumnFieldId(id) && mobileOverrideField(id) === null)
      .map(([id, v]) => [id, v === '' ? null : v]),
  )
  const folded = withJsonColumnsPreview({ ...changes } as Record<string, unknown>, row as Record<string, unknown>)
  const jsonColumns = Object.fromEntries(JSON_COLUMNS.filter((c) => c.column in folded).map((c) => [c.column, folded[c.column]]))
  const cleared = clearedPhoneOverrides(changes)
  const phone = Object.keys(cleared).length ? { mobile_overrides: mergeMobileOverrides(overridesOf(row), cleared) } : {}
  return { ...row, ...real, ...jsonColumns, ...phone }
}

const sameValue = (a: unknown, b: unknown) => (a ?? '') === (b ?? '')

/**
 * Fields whose saved value moved since the editor opened (someone saved the
 * Studio meanwhile). `base` = the values the editor started from.
 */
export function lookConflicts(changes: LookChanges, base: Readonly<Record<string, unknown>>, current: Row): string[] {
  const now = lookValues(current)
  // Already holding the new value (a retry after a half-finished publish) is not a conflict.
  return Object.keys(changes).filter((id) => !sameValue(base[id], now[id]) && !sameValue(changes[id], now[id]))
}

/** The unsaved changes left once `sent` is stored: edits made while it was saving are kept. */
export function remainingLookChanges(changes: LookChanges, sent: LookChanges): LookChanges {
  return Object.fromEntries(Object.entries(changes).filter(([id, value]) => !(id in sent) || !sameValue(sent[id], value)))
}

/**
 * The tenants columns to write: real columns as given ('' clears), each JSON
 * column folded whole over its CURRENT saved value, so keys this editor did
 * not touch are kept as they are in the database.
 */
export function lookPatch(changes: LookChanges, current: Row): Record<string, unknown> {
  const ids = Object.keys(changes)
  const real = Object.fromEntries(ids.filter((id) => !isJsonColumnFieldId(id) && mobileOverrideField(id) === null).map((id) => [id, changes[id]]))
  // Phone overrides are only ever cleared, folded over the CURRENT map so other phone settings stay.
  const cleared = clearedPhoneOverrides(changes)
  const phone = Object.keys(cleared).length ? { mobile_overrides: mergeMobileOverrides(overridesOf(current), cleared) } : {}
  return { ...real, ...foldedJsonColumns(ids, changes as Record<string, unknown>, current as Record<string, unknown>), ...phone }
}


/** Stored designs are large and the Look never reads them: kept out of the editor's copy of the row. */
const HEAVY_COLUMN = /(^|_)design$/

/**
 * The store row the Page Designer hands the browser: the storefront's own
 * (public) tenant read, minus the stored builder designs.
 */
export function lookStoreRow(row: Row): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !HEAVY_COLUMN.test(key)))
}
