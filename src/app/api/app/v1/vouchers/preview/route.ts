import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handleVoucherPreview } from '@/lib/app-api/orders/orders-http'

/**
 * POST /api/app/v1/vouchers/preview (Authorization: Bearer cs1.…)
 *   {code, orderTypeId, outletId, lines} → AppVoucherPreview
 * What the code takes off THIS bag, priced by the server like the order will be.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:voucher-preview', per: 'ip', max: 30, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'voucher-preview' }, (context) => handleVoucherPreview(context)),
})
