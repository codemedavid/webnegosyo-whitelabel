'use client'

import { createClient } from '@/lib/supabase/client'

/**
 * Telling the platform that a Convex order moved, from the WEB admin.
 *
 * The merchant app has posted these events for a while; the web admin never
 * did. A Convex-backed store worked entirely from the browser therefore left
 * `customer_external_orders` frozen at order-create — so a delivery never
 * counted as a visit and no loyalty stamp was ever earned. The order itself
 * has already changed in Convex by the time this runs; this is the
 * platform-side projection catching up.
 *
 * Best-effort by contract, exactly like the app's sibling: nothing here
 * throws, and the sync route's write is idempotent, so a retry is safe and a
 * missed event is recoverable.
 */

const SYNC_PATH = '/api/customers/sync-order-lifecycle'

export interface WebLifecycleSyncInput {
  tenantId: string | null | undefined
  externalOrderId: string
  status?: string
  paymentStatus?: string
}

export async function notifyConvexLifecycleSync(input: WebLifecycleSyncInput): Promise<void> {
  if (!input.tenantId) return
  if (!input.status && !input.paymentStatus) return

  try {
    const { data } = await createClient().auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return

    const response = await fetch(SYNC_PATH, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        tenantId: input.tenantId,
        backend: 'convex',
        externalOrderId: input.externalOrderId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
      }),
    })
    if (!response.ok) throw new Error(`Customer lifecycle sync failed (${response.status})`)
  } catch (error) {
    console.warn('[lifecycle-sync] could not report order lifecycle:', error)
  }
}
