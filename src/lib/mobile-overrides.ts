/**
 * Per-device (mobile) branding overrides.
 *
 * The Branding Studio can give any field a distinct mobile value. Rather than a
 * `mobile_*` column per field, a single JSONB map of column_name -> value is
 * stored (tenants.mobile_overrides / product_detail_settings.mobile_overrides)
 * and overlaid over the desktop columns at render time when the viewport is
 * mobile. An empty map means "inherit desktop for everything".
 */

export type OverrideMap = Record<string, unknown>

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Merge a mobile draft into the saved override map for publishing. A blank
 * draft value removes the key (inherit desktop again); any other value sets it.
 * Returns a new object — never mutates `existing`.
 */
export function mergeMobileOverrides(existing: OverrideMap, draft: OverrideMap): OverrideMap {
  const next: OverrideMap = { ...existing }
  for (const [key, value] of Object.entries(draft)) {
    if (isBlank(value)) delete next[key]
    else next[key] = value
  }
  return next
}

/**
 * Resolve a field's value for the mobile editor row: mobile draft (blank =
 * inherit desktop) → saved mobile override → the already-resolved desktop value.
 */
export function resolveMobileFieldValue(
  fieldId: string,
  mobileDraft: OverrideMap,
  savedMobile: OverrideMap,
  desktopValue: unknown
): unknown {
  if (Object.prototype.hasOwnProperty.call(mobileDraft, fieldId)) {
    const value = mobileDraft[fieldId]
    return isBlank(value) ? desktopValue : value
  }
  const saved = savedMobile[fieldId]
  return isBlank(saved) ? desktopValue : saved
}

/**
 * Pick a template/layout value for the mobile viewport.
 *
 * Precedence: the Branding Studio's per-device choice (from `mobile_overrides`)
 * → a legacy dedicated `mobile_*` column written by the old editor → the
 * desktop value. Without this order a stale legacy column silently shadows the
 * Studio's choice, so publishing a mobile layout appears to do nothing.
 * `'inherit'` is the editor's explicit "same as desktop" and counts as blank.
 */
export function resolveDeviceTemplate(
  overrideValue: unknown,
  legacyValue: string | null | undefined,
  desktopValue: string
): string {
  const override = typeof overrideValue === 'string' ? overrideValue : ''
  if (override && override !== 'inherit') return override
  if (legacyValue && legacyValue !== 'inherit') return legacyValue
  return desktopValue
}

/**
 * Overlay a saved override map over a base object (tenant columns or product
 * settings) at runtime. Blank override values are ignored so a stray empty
 * entry can never blank out a real desktop value. Returns a new object.
 */
export function applyMobileOverrides<T extends Record<string, unknown>>(
  base: T,
  overrides: OverrideMap | undefined | null
): T {
  if (!overrides) return base
  const clean: OverrideMap = {}
  for (const [key, value] of Object.entries(overrides)) {
    if (!isBlank(value)) clean[key] = value
  }
  if (Object.keys(clean).length === 0) return base
  return { ...base, ...clean }
}
