import type { Metadata } from 'next'
import { MapPinOff } from 'lucide-react'
import { DELIVERY_ADDRESS_FIELD_NAME } from '@/lib/customer-details'
import { deliveryEditRefusal } from '@/lib/delivery/order-delivery-edit'
import { resolveDeliveryOrigin } from '@/lib/delivery/delivery-origin'
import { verifyPinLinkToken } from '@/lib/delivery/pin-link-token'
import { resolveOrderBackend } from '@/lib/order-backend'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/uuid'
import { PinLinkForm } from './pin-link-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Set your delivery spot',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

interface PinLinkPageProps {
  params: Promise<{ tenant: string; orderId: string }>
  searchParams: Promise<{ t?: string }>
}

const EXPIRED = 'This link has expired. Please ask the store for a new one.'

function LinkProblem({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <MapPinOff aria-hidden="true" className="h-8 w-8 text-gray-400" />
      <p className="text-base text-gray-700">{message}</p>
    </main>
  )
}

/**
 * A customer's own page for dropping a pin on an order, from a link the store
 * sent. The link is all they have, and links get forwarded, so it shows only
 * the store and the order number: never the name, phone, items or the current
 * address and pin. The map starts at the store.
 */
export default async function PinLinkPage({ params, searchParams }: PinLinkPageProps) {
  const { tenant: slug, orderId } = await params
  const { t: token } = await searchParams
  if (!token || !isUuid(orderId) || !verifyPinLinkToken(orderId, token)) return <LinkProblem message={EXPIRED} />

  const admin = createAdminClient()
  const { data: storeData } = await admin
    .from('tenants')
    .select('id, name, order_backend, convex_deployment_url, mapbox_enabled, lalamove_enabled, lalamove_market, restaurant_address, restaurant_latitude, restaurant_longitude, delivery_radius_km')
    .eq('slug', slug)
    .maybeSingle()
  const store = storeData as unknown as (Parameters<typeof resolveOrderBackend>[0] & Parameters<typeof resolveDeliveryOrigin>[0] & {
    id: string
    name: string
    mapbox_enabled: boolean | null
    lalamove_enabled: boolean | null
    lalamove_market: string | null
  }) | null
  if (!store || resolveOrderBackend(store) !== 'platform') return <LinkProblem message={EXPIRED} />

  const { data: orderData } = await admin
    .from('orders')
    .select('status, customer_data, lalamove_order_id, lalamove_status, daily_number')
    .eq('id', orderId)
    .eq('tenant_id', store.id)
    .maybeSingle()
  const order = orderData as unknown as {
    status: string | null
    customer_data: Record<string, unknown> | null
    lalamove_order_id: string | null
    lalamove_status: string | null
    daily_number: number | null
  } | null
  if (!order) return <LinkProblem message={EXPIRED} />

  const refusal = deliveryEditRefusal({ status: order.status, lalamoveOrderId: order.lalamove_order_id, lalamoveStatus: order.lalamove_status })
  if (refusal) return <LinkProblem message="This order can no longer change. Please call the store if something is wrong." />

  const origin = resolveDeliveryOrigin(store, null)
  const existingAddress = order.customer_data?.[DELIVERY_ADDRESS_FIELD_NAME]

  return (
    <PinLinkForm
      tenantId={store.id}
      orderId={orderId}
      token={token}
      storeName={store.name}
      orderNumber={order.daily_number}
      mapsEnabled={store.mapbox_enabled ?? true}
      biasCenter={origin?.point ?? null}
      radiusKm={origin?.radiusKm ?? null}
      market={store.lalamove_market}
      lalamoveEnabled={store.lalamove_enabled}
      // The address already on the order stays: the customer can't see it here, and a map label must not replace it.
      keepsAddress={typeof existingAddress === 'string' && existingAddress.trim() !== ''}
    />
  )
}
