import type { CSSProperties } from 'react'

import type { PageId } from '@/lib/page-designer/types'

import { checkoutThemeStyle } from './page-theme-checkout'
import { confirmationThemeStyle } from './page-theme-confirmation'
import { trackingThemeStyle } from './page-theme-tracking'

type TenantRow = Readonly<Record<string, unknown>>

const THEMES: Record<PageId, (tenant: TenantRow) => CSSProperties> = {
  tracking: trackingThemeStyle,
  confirmation: confirmationThemeStyle,
  checkout: checkoutThemeStyle,
}

/**
 * The page's own theme variables (`--trk-*` for tracking, `--co-*` for
 * checkout and the thank-you page) for the editor canvas, so sample blocks
 * paint exactly like the live page. Server-safe (pure).
 */
export function pageThemeStyle(page: PageId, tenant: TenantRow): CSSProperties {
  return THEMES[page](tenant)
}
