/**
 * Payment methods and order types for Owl, read through the caller's own
 * session like the Payment methods screen (RLS applies on top of the tool's
 * `store_setup` gate); a store has a handful of each, so the reads are bounded.
 */

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { AssistantPaymentMethod, StoreOrderType } from '@/lib/assistant/insights/payment-methods'

const MAX_ROWS = 100

interface MethodRow {
  id: string
  name: string
  details: string | null
  qr_code_url: string | null
  is_active: boolean | null
  require_payment_proof: boolean | null
  updated_at: string | null
  payment_method_order_types: Array<{ order_type_id: string }> | null
}

export interface StorePaymentSetup {
  methods: AssistantPaymentMethod[]
  orderTypes: StoreOrderType[]
}

export async function readPaymentSetup(tenantId: string): Promise<StorePaymentSetup> {
  const client = await createClient()
  const [methods, orderTypes] = await Promise.all([
    client
      .from('payment_methods')
      .select('id, name, details, qr_code_url, is_active, require_payment_proof, updated_at, payment_method_order_types(order_type_id)')
      .eq('tenant_id', tenantId)
      .order('order_index', { ascending: true })
      .limit(MAX_ROWS),
    client.from('order_types').select('id, type, name, is_enabled').eq('tenant_id', tenantId).order('order_index', { ascending: true }).limit(MAX_ROWS),
  ])
  if (methods.error) throw new Error('Payment methods could not be read.')
  if (orderTypes.error) throw new Error('Order types could not be read.')

  return {
    methods: ((methods.data ?? []) as MethodRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      details: row.details,
      qrCodeUrl: row.qr_code_url,
      isActive: row.is_active !== false,
      requireProof: row.require_payment_proof === true,
      orderTypeIds: (row.payment_method_order_types ?? []).map((link) => link.order_type_id),
      updatedAt: row.updated_at,
    })),
    orderTypes: ((orderTypes.data ?? []) as Array<{ id: string; type: string; name: string; is_enabled: boolean | null }>).map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      isEnabled: row.is_enabled !== false,
    })),
  }
}

/**
 * Host a photo the owner attached (a payment QR) on our CDN, so the confirm
 * card can show it and the stored proposal holds a URL, not megabytes. An
 * unconfirmed proposal leaves an unused image behind — the price of showing
 * the owner exactly what customers will scan.
 */
export async function hostPaymentQr(tenantId: string, dataUrl: string): Promise<string> {
  const { uploadBase64ToImageKit } = await import('@/lib/imagekit-server')
  const hosted = await uploadBase64ToImageKit(dataUrl, { folder: `payment-qr-codes/${tenantId}`, fileName: `owl-qr-${Date.now()}.jpg` })
  return hosted.url
}
