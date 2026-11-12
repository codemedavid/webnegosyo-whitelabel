import { appRoute } from '@/lib/app-api/app-route'
import { handleVoucherPreview } from '@/lib/app-api/orders/orders-http'

/**
 * POST /api/app/v1/vouchers/preview (Authorization: Bearer cs1.…)
 *   {code, orderTypeId, outletId, lines} → AppVoucherPreview
 * What the code takes off THIS bag, priced by the server like the order will be.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = appRoute({ scope: 'voucher-preview', rateLimit: { limit: 30, windowSec: 60 } }, (context) => handleVoucherPreview(context))
