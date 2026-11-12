import type { SupabaseClient } from '@supabase/supabase-js'
import { ADMIN_QUERY_TIMEOUT_MS, createAdminClient } from '@/lib/supabase/admin'
import { projectLoyaltyReceipts } from '@/lib/loyalty/projection-worker'
import { reconcileLoyaltyRefunds } from '@/lib/loyalty/refund-reconciliation'
import { respond } from '@/lib/loyalty/merchant-http'
import { defineRoute } from '@/platform/http/define-route'

// The edge middleware waits on this function’s first byte. Stay under the 25s
// kill; the admin client’s 8s budget is what actually bounds the RPCs.
export const maxDuration = 20

/** Vercel cron: `Authorization: Bearer $CRON_SECRET`, checked by the `cron` kind. */
export const GET = defineRoute({
  auth: { kind: 'cron' },
  handler: async () => {
    try {
      const admin: SupabaseClient = createAdminClient({
        timeoutMs: ADMIN_QUERY_TIMEOUT_MS,
      })
      const { data, error } = await admin.rpc('cleanup_loyalty_data')
      if (error) throw error
      // Existing paid receipts must keep syncing even when new redemption is off.
      const projections = await projectLoyaltyReceipts(admin, 3)
      const refunds = await reconcileLoyaltyRefunds(admin, 5)
      return respond({ success: true, ...data, projections, refunds }, 200)
    } catch (error) {
      console.error('[loyalty/maintenance]', error)
      return respond({ error: 'Loyalty maintenance failed.' }, 503)
    }
  },
})
