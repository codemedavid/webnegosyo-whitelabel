import { Clock } from 'lucide-react'
import type { StoreOpenStatus } from '@/lib/store-open-status'
import { STORE_CLOSED_MESSAGE } from '@/lib/store-open-status'

/**
 * Storefront "we're closed" notice.
 *
 * Renders nothing whenever ordering is allowed, so every tenant that has not
 * opted into operating-hours enforcement sees exactly the page they saw before.
 *
 * Stacks at `z-40` for the same reason as `AnnouncementBar`: above page content,
 * below the z-50 layer every Radix portal paints on, so an open cart drawer is
 * never covered by it.
 */

const DEFAULT_BG_COLOR = '#FEF2F2'
const DEFAULT_TEXT_COLOR = '#991B1B'

interface StoreClosedBannerProps {
  status: StoreOpenStatus
  /** Optional inline variant for placement inside a card or product page. */
  className?: string
}

export function StoreClosedBanner({ status, className = '' }: StoreClosedBannerProps) {
  if (!status.isOrderingBlocked) return null

  return (
    <div
      data-testid="store-closed-banner"
      role="status"
      className={`w-full py-2.5 px-4 text-sm font-medium relative z-40 ${className}`}
      style={{ backgroundColor: DEFAULT_BG_COLOR, color: DEFAULT_TEXT_COLOR }}
    >
      <div className="flex items-center justify-center gap-2 text-center flex-wrap">
        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="font-semibold">{STORE_CLOSED_MESSAGE}</span>
        {status.nextOpenLabel && (
          <span className="opacity-90">Opens {status.nextOpenLabel}</span>
        )}
      </div>
    </div>
  )
}
