import { z } from 'zod'
import { appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'
import { handleGetOrder } from '@/lib/app-api/orders/orders-http'

/**
 * GET /api/app/v1/orders/<id> (Authorization: Bearer cs1.…) → AppOrderDetail
 * The caller's own app order only (anyone else's is 404); live status from the
 * order's backend, lines and totals from the snapshot taken when it was placed.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:order', per: 'ip', max: 120, window: '1m', onRedisFailure: 'instance' },
  params: z.object({ id: z.string() }),
  onRefusal: appRefusal,
  handler: ({ request, params }) => appRoute({ scope: 'order' }, (context) => handleGetOrder(context, params.id))({ request }),
})
