import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { parseCustomerCaptureRequest } from '@/lib/customer-capture-request'
import { captureAppOrder } from '@/lib/customer-capture-service'
import type { CaptureBackendClient } from '@/lib/customers/capture-backend'

/**
 * POST /api/customers/capture-order
 *
 * The merchant app writes its orders straight to Convex or to the platform
 * Supabase through its own adapter, so it never passes through
 * `createOrderAction` or `orders-service` — the only two places customer capture
 * is wired. Without this route, an order rung up on the register built no
 * customer profile at all: the cashier could type the guest's number in
 * perfectly and the Regulars list would never hear about it.
 *
 * Best-effort by the same reasoning as the sibling stock route: the register
 * calls this once the sale is written and the money is in the drawer, so this
 * reports success as soon as the caller is authorized, whatever the capture then
 * does. The capture is idempotent (recompute-then-save), so a retry is safe and
 * a missed sale can be backfilled.
 *
 * Authenticated with the caller's own Supabase access token — the same trust
 * level as /api/inventory/order-stock.
 *
 * Note on the backend: the body's `backend` is never trusted. The tenant's
 * resolved order backend decides (a platform store's capture is corrected to
 * `platform`, a foreign-backend mismatch is refused), and a platform order is
 * linked only when it is this tenant's row.
 *
 * Note on the tenant check: it is deliberately the *caller's* tenant that
 * decides, never the body's claim alone. `customers` is PII, and the capture
 * runs service-role; a caller able to name any tenant here could seed another
 * store's guest list and read it back from their own app.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)

  const parsed = parseCustomerCaptureRequest(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const capture = parsed.value

  const caller = await requireBearerStoreCaller(request, capture.tenantId, 'create')
  if (!caller.ok) return caller.response

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { createSupabaseCustomerStore, upsertCustomerFromOrder } = await import(
    '@/lib/customers-service'
  )
  const { captureExternalOrderBestEffort } = await import('@/lib/customer-external-orders')
  const { verifyCaptureBackend } = await import('@/lib/customers/capture-backend')
  const admin = createAdminClient()

  // The body's backend is a claim, not a fact: the tenant's resolved backend
  // decides where the order lives (see lib/customers/capture-backend.ts).
  // Cast to the structural slice: matching the fully-typed client against it
  // trips TS2589 (excessively deep instantiation).
  const verified = await verifyCaptureBackend(admin as unknown as CaptureBackendClient, capture)
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status })
  }

  const customerId = await captureAppOrder(verified.request, {
    capturePlatformOrder: (tenantId, input) =>
      upsertCustomerFromOrder(createSupabaseCustomerStore(admin), tenantId, input),
    captureExternalOrder: (tenantId, order) =>
      captureExternalOrderBestEffort(admin, tenantId, order),
    now: () => new Date().toISOString(),
  })

  // `customerId: null` is a normal outcome, not a failure — an anonymous
  // walk-in identifies nobody and never becomes a customer.
  return NextResponse.json({ success: true, customerId })
}
