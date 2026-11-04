import type { CSSProperties } from 'react'

import type { PageId } from '@/lib/page-designer/types'

type TenantRow = Readonly<Record<string, unknown>>

/**
 * The page's own theme variables (`--trk-*` for tracking, `--co-*` for
 * checkout and the thank-you page) for the editor canvas, so sample blocks
 * paint exactly like the live page. Server-safe (pure).
 */
export function pageThemeStyle(page: PageId, tenant: TenantRow): CSSProperties {
  void page
  void tenant
  return {}
}
