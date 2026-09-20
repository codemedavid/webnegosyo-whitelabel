/**
 * Writing one order event — the I/O half of order-event.ts.
 *
 * Every writer runs on the platform after verifying the caller: the web's own
 * status update, the customer lifecycle route (which the app and the web's
 * Convex admin both post to with the actor's token) and the register's
 * sale post. All three funnel here so the dedupe rule and the name snapshot
 * are decided once.
 *
 * Best-effort by contract: by the time this runs the order has already moved
 * in its own backend. A missing event is a gap in a report; an order that
 * refuses to confirm because bookkeeping failed is a stuck counter. So
 * `recordOrderEventBestEffort` never throws.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  shouldRecordEvent,
  type OrderEventDraft,
  type OrderStatusEvent,
} from './order-event'

export interface OrderEventKey {
  tenantId: string
  backend: OrderEventDraft['backend']
  externalOrderId: string
}

export interface OrderEventStore {
  findLastEvent(key: OrderEventKey): Promise<Pick<OrderStatusEvent, 'event' | 'status'> | null>
  insert(draft: OrderEventDraft): Promise<void>
  /** The account's current display name, or null when the account is unknown. */
  findActorName(userId: string): Promise<string | null>
}

export type RecordOutcome = 'recorded' | 'redundant'

/** The name a report will show. The draft's own name is the fallback, never the first choice. */
async function resolveActorName(store: OrderEventStore, draft: OrderEventDraft): Promise<string> {
  if (!draft.actorUserId) return draft.actorName || 'Unknown'
  const known = await store.findActorName(draft.actorUserId)
  return known || draft.actorName || 'Staff'
}

export async function recordOrderEvent(store: OrderEventStore, draft: OrderEventDraft): Promise<RecordOutcome> {
  const last = await store.findLastEvent({
    tenantId: draft.tenantId,
    backend: draft.backend,
    externalOrderId: draft.externalOrderId,
  })
  if (!shouldRecordEvent(last, draft)) return 'redundant'

  await store.insert({ ...draft, actorName: await resolveActorName(store, draft) })
  return 'recorded'
}

export async function recordOrderEventBestEffort(store: OrderEventStore, draft: OrderEventDraft): Promise<void> {
  try {
    await recordOrderEvent(store, draft)
  } catch (error) {
    console.warn('[order-events] could not record order event', {
      tenantId: draft.tenantId,
      externalOrderId: draft.externalOrderId,
      status: draft.status,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

type Db = Pick<SupabaseClient<Database>, 'from'>

export function createSupabaseOrderEventStore(db: Db): OrderEventStore {
  return {
    async findLastEvent(key) {
      const { data, error } = await db
        .from('order_status_events')
        .select('event, status')
        .eq('tenant_id', key.tenantId)
        .eq('backend', key.backend)
        .eq('external_order_id', key.externalOrderId)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null
      return { event: data.event as OrderStatusEvent['event'], status: data.status }
    },

    async insert(draft) {
      const { error } = await db.from('order_status_events').insert({
        tenant_id: draft.tenantId,
        outlet_id: draft.outletId ?? null,
        backend: draft.backend,
        external_order_id: draft.externalOrderId,
        event: draft.event,
        status: draft.status,
        previous_status: draft.previousStatus ?? null,
        source: draft.source ?? null,
        order_total: draft.orderTotal ?? null,
        actor_user_id: draft.actorUserId,
        actor_name: draft.actorName,
        ...(draft.occurredAt ? { occurred_at: draft.occurredAt } : {}),
      })
      if (error) throw new Error(error.message)
    },

    async findActorName(userId) {
      const { data, error } = await db
        .from('app_users')
        .select('display_name, email')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data?.display_name || data?.email || null
    },
  }
}
