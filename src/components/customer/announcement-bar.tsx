import type { Tenant } from '@/types/database'

/**
 * The z-index every Radix portal (Sheet / Dialog / AlertDialog) paints on.
 * Anything rendered in the storefront page flow must stay below it, otherwise
 * it bleeds over open drawers and modals.
 */
export const OVERLAY_Z_INDEX = 50

const DEFAULT_BG_COLOR = '#FFF4E5'
const DEFAULT_TEXT_COLOR = '#663C00'
const DEFAULT_TEXT = 'Welcome!'

interface AnnouncementBarProps {
  tenant: Tenant | null | undefined
}

/**
 * Storefront announcement strip shown above the menu header.
 *
 * Sits at `z-40` — above page content (so it wins against the menu's own
 * stacking) but below `OVERLAY_Z_INDEX`, so the cart drawer and every modal
 * paint over it instead of being covered by it.
 */
export function AnnouncementBar({ tenant }: AnnouncementBarProps) {
  if (!tenant?.is_announcement_visible) return null

  return (
    <div
      data-testid="announcement-bar"
      data-branding-scope="storefront/announcement"
      className="w-full text-center py-2 px-4 text-sm font-medium relative z-40"
      style={{
        backgroundColor: tenant.announcement_bg_color || DEFAULT_BG_COLOR,
        color: tenant.announcement_text_color || DEFAULT_TEXT_COLOR,
      }}
    >
      {tenant.announcement_text || DEFAULT_TEXT}
    </div>
  )
}
