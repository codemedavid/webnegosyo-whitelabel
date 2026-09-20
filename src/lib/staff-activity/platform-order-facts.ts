import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { OrderEventSource } from './order-event'

export interface PlatformOrderFacts {
  outletId: string | null
  source: OrderEventSource
  orderTotal: number | null
}

/**
 * The three facts an event wants that a status mutation does not carry.
 * Null on any failure: the event is still worth writing without them.
 */
export async function readPlatformOrderFacts(
  db: Pick<SupabaseClient<Database>, 'from'>,
  tenantId: string,
  orderId: string,
): Promise<PlatformOrderFacts | null> {
  try {
    const { data } = await db
      .from('orders')
      .select('outlet_id, source, total')
      .eq('tenant_id', tenantId)
      .eq('id', orderId)
      .maybeSingle()
    if (!data) return null
    return {
      outletId: data.outlet_id ?? null,
      source: data.source === 'pos' ? 'pos' : 'online',
      orderTotal: typeof data.total === 'number' ? data.total : Number(data.total) || null,
    }
  } catch {
    return null
  }
}
