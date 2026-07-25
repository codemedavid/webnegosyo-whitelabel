/**
 * Storefront layout/card/header resolution per device.
 *
 * The menu page renders a desktop and (when they differ) a mobile variant. Each
 * of the three choices can come from three places, in this order:
 *   1. the Branding Studio's per-device `mobile_overrides` map
 *   2. a legacy dedicated `mobile_*` column from the old branding editor
 *   3. the desktop column
 *
 * Kept as a pure module so the precedence is unit-testable without rendering
 * the whole menu page.
 */

import { resolveDeviceTemplate, type OverrideMap } from '@/lib/mobile-overrides'

const DEFAULT_PAGE_LAYOUT = 'default'
const DEFAULT_CARD_TEMPLATE = 'classic'
const DEFAULT_HEADER_TEMPLATE = 'classic'

/** The tenant columns this resolver reads (a subset of Tenant). */
interface DeviceLayoutTenant {
  page_layout?: string | null
  card_template?: string | null
  header_template?: string | null
  mobile_page_layout?: string | null
  mobile_card_template?: string | null
  mobile_header_template?: string | null
}

export interface StorefrontDeviceLayout {
  desktopLayout: string
  mobileLayout: string
  desktopCard: string
  mobileCard: string
  desktopHeader: string
  mobileHeader: string
  /** True when the mobile variant needs its own render of the menu body. */
  needsDualRender: boolean
}

/**
 * @param tenant  Tenant columns (already merged with any live preview draft).
 * @param mobileOverrides Effective mobile override map — empty on a desktop
 *   viewport, so the desktop values are returned for both devices.
 */
export function resolveStorefrontLayout(
  tenant: DeviceLayoutTenant | null | undefined,
  mobileOverrides: OverrideMap
): StorefrontDeviceLayout {
  const overrides = mobileOverrides ?? {}

  const desktopLayout = tenant?.page_layout || DEFAULT_PAGE_LAYOUT
  const desktopCard = tenant?.card_template || DEFAULT_CARD_TEMPLATE
  const desktopHeader = tenant?.header_template || DEFAULT_HEADER_TEMPLATE

  const mobileLayout = resolveDeviceTemplate(overrides.page_layout, tenant?.mobile_page_layout, desktopLayout)
  const mobileCard = resolveDeviceTemplate(overrides.card_template, tenant?.mobile_card_template, desktopCard)
  const mobileHeader = resolveDeviceTemplate(overrides.header_template, tenant?.mobile_header_template, desktopHeader)

  return {
    desktopLayout,
    mobileLayout,
    desktopCard,
    mobileCard,
    desktopHeader,
    mobileHeader,
    // The header renders both variants unconditionally (CSS-hidden), so only a
    // layout/card difference forces a second render of the menu body.
    needsDualRender: mobileLayout !== desktopLayout || mobileCard !== desktopCard,
  }
}
