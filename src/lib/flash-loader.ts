import type { Tenant } from '@/types/database'

/**
 * Normalized branding for the per-tenant flash screen used as a loading state.
 *
 * A `FlashScreenBranding` is fully resolved (defaults applied) so presentational
 * components never re-implement fallbacks. `null` means "no branded flash" — the
 * caller should render its normal skeleton instead.
 */
export interface FlashScreenBranding {
  title: string
  subtitle: string | null
  imageUrl: string | null
  initial: string
  backgroundColor: string
  textColor: string
}

const DEFAULT_BACKGROUND = '#111111'
const DEFAULT_TEXT = '#ffffff'
const DEFAULT_TITLE = 'Loading…'

type FlashTenant = Pick<
  Tenant,
  | 'flash_screen_feature_enabled'
  | 'flash_screen_is_active'
> | null | undefined

/**
 * The flash screen shows only when the superadmin has enabled the feature for
 * the tenant AND the tenant admin has toggled it active. Either being off hides
 * it — this two-gate rule is why "turning it on" in the admin panel alone does
 * nothing when the feature flag is off.
 */
export function isFlashScreenEnabled(tenant: FlashTenant): boolean {
  return Boolean(tenant?.flash_screen_feature_enabled && tenant?.flash_screen_is_active)
}

/**
 * Build branding from a tenant WITHOUT applying the enable gate. Used by the
 * Branding Studio preview, which must render the flash surface regardless of
 * whether the tenant has switched it on yet.
 */
export function buildFlashScreenBranding(tenant: Tenant | null | undefined): FlashScreenBranding {
  const initialSource = (tenant?.name || tenant?.slug || '?').trim() || '?'

  return {
    title: tenant?.flash_screen_title?.trim() || DEFAULT_TITLE,
    subtitle: tenant?.flash_screen_subtitle?.trim() || null,
    imageUrl: tenant?.flash_screen_image_url?.trim() || tenant?.logo_url?.trim() || null,
    initial: initialSource.charAt(0).toUpperCase(),
    backgroundColor: tenant?.flash_screen_background_color?.trim() || DEFAULT_BACKGROUND,
    textColor: tenant?.flash_screen_text_color?.trim() || DEFAULT_TEXT,
  }
}

/**
 * Resolve the branded flash loading state for a tenant, or `null` when it is not
 * enabled (callers then fall back to their normal skeleton).
 */
export function resolveFlashScreenBranding(tenant: Tenant | null | undefined): FlashScreenBranding | null {
  if (!isFlashScreenEnabled(tenant)) return null
  return buildFlashScreenBranding(tenant)
}
