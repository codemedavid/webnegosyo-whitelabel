import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export const LALAMOVE_BOOKING_PENDING = 'BOOKING'
export const LALAMOVE_BOOKING_PENDING_MESSAGE =
  'A delivery booking is already in progress or awaiting confirmation. Check Lalamove before booking again.'

export interface LalamoveBookingClaim {
  orderId: string
  tenantId: string
  quotationId: string
}

type ClaimResult = { success: true } | { success: false; error: string }

function claimedOrder(client: SupabaseClient<Database>, claim: LalamoveBookingClaim) {
  return (patch: Database['public']['Tables']['orders']['Update']) => client.from('orders')
    .update(patch)
    .eq('id', claim.orderId)
    .eq('tenant_id', claim.tenantId)
    .eq('lalamove_quotation_id', claim.quotationId)
    .eq('lalamove_status', LALAMOVE_BOOKING_PENDING)
    .is('lalamove_order_id', null)
    .select('id')
    .maybeSingle()
}

/** Compare and set in Postgres before requesting a paid rider. Both the app
 * route and web action must acquire this same claim. Never expire a claim
 * automatically: a timed-out provider request may still have booked a rider. */
export async function claimLalamoveBooking(
  client: SupabaseClient<Database>,
  claim: LalamoveBookingClaim,
): Promise<ClaimResult> {
  const { data, error } = await client.from('orders')
    .update({ lalamove_status: LALAMOVE_BOOKING_PENDING })
    .eq('id', claim.orderId)
    .eq('tenant_id', claim.tenantId)
    .eq('lalamove_quotation_id', claim.quotationId)
    .is('lalamove_order_id', null)
    .or('lalamove_status.is.null,lalamove_status.neq.BOOKING')
    .select('id')
    .maybeSingle()
  if (error) return { success: false, error: 'Could not reserve this order for delivery. Please try again.' }
  if (!data) return { success: false, error: LALAMOVE_BOOKING_PENDING_MESSAGE }
  return { success: true }
}

/** Use only when the provider confirms no booking could have been placed. */
export async function releaseLalamoveBookingClaim(
  client: SupabaseClient<Database>,
  claim: LalamoveBookingClaim,
): Promise<ClaimResult> {
  const { data, error } = await claimedOrder(client, claim)({ lalamove_status: null })
  if (error || !data) return { success: false, error: LALAMOVE_BOOKING_PENDING_MESSAGE }
  return { success: true }
}

export async function persistLalamoveBooking(
  client: SupabaseClient<Database>,
  claim: LalamoveBookingClaim,
  placed: { orderId: string; status?: string; shareLink?: string },
): Promise<ClaimResult> {
  const failure = {
    success: false as const,
    error: `Delivery booked (${placed.orderId}), but we could not save its reference. Check Lalamove before booking again.`,
  }
  try {
    const { data, error } = await claimedOrder(client, claim)({
      lalamove_order_id: placed.orderId,
      lalamove_status: placed.status ?? 'ASSIGNING_DRIVER',
      lalamove_tracking_url: placed.shareLink ?? '',
    })
    return error || !data ? failure : { success: true }
  } catch {
    return failure
  }
}
