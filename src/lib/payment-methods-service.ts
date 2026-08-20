/**
 * Payment Methods service for tenant admin operations
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantPermission } from '@/lib/admin-service'
import {
  loyverseListAll,
  LoyverseApiError,
  type LoyversePaymentType,
} from '@/lib/loyverse/client'
import {
  planPaymentMethodSync,
  type SyncablePaymentMethod,
} from '@/lib/loyverse/payment-methods-sync'
import type { PaymentMethod } from '@/types/database'
import type { ProvisioningCtx } from '@/lib/provisioning/context'

export interface PaymentMethodWithOrderTypes extends PaymentMethod {
  order_types: string[] // Array of order_type_ids
}

// ============================================
// Payment Methods Operations
// ============================================

export async function getPaymentMethodsByTenant(tenantId: string) {
  await verifyTenantPermission(tenantId, 'store_setup')
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('payment_methods')
    .select(`
      *,
      payment_method_order_types(order_type_id)
    `)
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true })

  if (error) throw error
  
  // Transform to include order_types array
  const paymentMethods = (data as unknown as Array<PaymentMethod & { payment_method_order_types: Array<{ order_type_id: string }> }>).map(pm => ({
    ...pm,
    order_types: pm.payment_method_order_types?.map((pmot: { order_type_id: string }) => pmot.order_type_id) || [],
    payment_method_order_types: undefined,
  }))
  
  return paymentMethods as PaymentMethodWithOrderTypes[]
}

export async function getPaymentMethodById(paymentMethodId: string, tenantId: string) {
  await verifyTenantPermission(tenantId, 'store_setup')
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('payment_methods')
    .select(`
      *,
      payment_method_order_types(order_type_id)
    `)
    .eq('id', paymentMethodId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) throw error
  
  // Transform to include order_types array
  const pm = data as unknown as PaymentMethod & { payment_method_order_types: Array<{ order_type_id: string }> }
  return {
    ...pm,
    order_types: pm.payment_method_order_types?.map((pmot: { order_type_id: string }) => pmot.order_type_id) || [],
    payment_method_order_types: undefined,
  } as PaymentMethodWithOrderTypes
}

export async function createPaymentMethod(
  tenantId: string,
  name: string,
  details?: string,
  qrCodeUrl?: string,
  isActive: boolean = true,
  orderTypes: string[] = [],
  requirePaymentProof: boolean = false,
  ctx?: ProvisioningCtx
) {
  if (!ctx) await verifyTenantPermission(tenantId, 'store_setup')

  const supabase = ctx?.client ?? (await createClient())

  // Get the next order_index
  const { data: lastMethod } = await supabase
    .from('payment_methods')
    .select('order_index')
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: false })
    .limit(1)
    .single()

  const orderIndex = lastMethod ? (lastMethod as { order_index: number }).order_index + 1 : 0

  // Create payment method
  const { data: paymentMethod, error: paymentMethodError } = await supabase
    .from('payment_methods')
    .insert({
      tenant_id: tenantId,
      name,
      details: details || null,
      qr_code_url: qrCodeUrl || null,
      is_active: isActive,
      order_index: orderIndex,
      require_payment_proof: requirePaymentProof,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single()

  if (paymentMethodError) throw paymentMethodError

  const pm = paymentMethod as unknown as PaymentMethod

  // Create order type associations
  if (orderTypes.length > 0) {
    const associations = orderTypes.map(orderTypeId => ({
      payment_method_id: pm.id,
      order_type_id: orderTypeId,
    }))

    const { error: associationsError } = await supabase
      .from('payment_method_order_types')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(associations as any)

    if (associationsError) throw associationsError
  }

  return pm
}

export async function updatePaymentMethod(
  paymentMethodId: string,
  tenantId: string,
  updates: {
    name?: string
    details?: string
    qr_code_url?: string
    is_active?: boolean
    require_payment_proof?: boolean
  }
) {
  await verifyTenantPermission(tenantId, 'store_setup')

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('payment_methods')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(updates as any)
    .eq('id', paymentMethodId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as PaymentMethod
}

export async function updatePaymentMethodOrderTypes(
  paymentMethodId: string,
  tenantId: string,
  orderTypeIds: string[]
) {
  await verifyTenantPermission(tenantId, 'store_setup')
  
  const supabase = await createClient()

  // Verify payment method belongs to tenant
  const { data: paymentMethod, error: verifyError } = await supabase
    .from('payment_methods')
    .select('id')
    .eq('id', paymentMethodId)
    .eq('tenant_id', tenantId)
    .single()

  if (verifyError || !paymentMethod) {
    throw new Error('Payment method not found')
  }

  // Delete existing associations
  const { error: deleteError } = await supabase
    .from('payment_method_order_types')
    .delete()
    .eq('payment_method_id', paymentMethodId)

  if (deleteError) {
    throw deleteError
  }

  // Create new associations
  if (orderTypeIds.length > 0) {
    const associations = orderTypeIds.map(orderTypeId => ({
      payment_method_id: paymentMethodId,
      order_type_id: orderTypeId,
    }))

    const { error: insertError } = await supabase
      .from('payment_method_order_types')
      .insert(associations)

    if (insertError) {
      throw insertError
    }
  }

  return { success: true }
}

export async function deletePaymentMethod(paymentMethodId: string, tenantId: string) {
  await verifyTenantPermission(tenantId, 'store_setup')
  
  const supabase = await createClient()

  const { error } = await supabase
    .from('payment_methods')
    .delete()
    .eq('id', paymentMethodId)
    .eq('tenant_id', tenantId)

  if (error) throw error
  return { success: true }
}

export async function reorderPaymentMethods(tenantId: string, paymentMethodIds: string[]) {
  await verifyTenantPermission(tenantId, 'store_setup')
  
  const supabase = await createClient()

  // Update order_index for each payment method
  const updates = paymentMethodIds.map((id, index) => 
    supabase
      .from('payment_methods')
      .update({ order_index: index })
      .eq('id', id)
      .eq('tenant_id', tenantId)
  )

  await Promise.all(updates)

  return { success: true }
}

export async function togglePaymentMethodStatus(
  paymentMethodId: string,
  tenantId: string,
  isActive: boolean
) {
  await verifyTenantPermission(tenantId, 'store_setup')
  
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('payment_methods')
    .update({ is_active: isActive })
    .eq('id', paymentMethodId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as PaymentMethod
}

// ============================================
// Public Customer-facing Operations
// ============================================

export async function getPaymentMethodsByOrderType(orderTypeId: string, tenantId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('payment_methods')
    .select(`
      *,
      payment_method_order_types!inner(order_type_id)
    `)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('payment_method_order_types.order_type_id', orderTypeId)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as unknown as PaymentMethod[]
}

export async function validatePaymentMethod(paymentMethodId: string, tenantId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('payment_methods')
    .select('id, name, is_active')
    .eq('id', paymentMethodId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single()

  if (error || !data) return false
  return true
}


// ============================================
// Loyverse Payment-Type Sync
// ============================================

export interface LoyversePaymentMethodSyncReport {
  success: boolean
  error?: string
  created: number
  renamed: number
  reactivated: number
  deactivated: number
  warnings: string[]
}

const EMPTY_SYNC_COUNTS = {
  created: 0,
  renamed: 0,
  reactivated: 0,
  deactivated: 0,
  warnings: [] as string[],
}

function syncFailure(error: string): LoyversePaymentMethodSyncReport {
  return { success: false, error, ...EMPTY_SYNC_COUNTS }
}

/**
 * Pulls the tenant's Loyverse payment types and materializes them as
 * payment_methods rows. Sync owns only name + liveness; merchant-authored
 * instructions (details, QR, proof requirement, order types) are untouched,
 * so merchants add those in Payment Settings after syncing.
 *
 * The Loyverse access token is a tenant secret, so it is read with the
 * service-role client after the caller's store_setup permission is verified.
 */
export async function syncPaymentMethodsFromLoyverse(
  tenantId: string
): Promise<LoyversePaymentMethodSyncReport> {
  await verifyTenantPermission(tenantId, 'store_setup')

  const admin = createAdminClient()
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('loyverse_enabled, loyverse_access_token')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError || !tenant) return syncFailure('Tenant not found')

  const tenantRow = tenant as { loyverse_enabled: boolean | null; loyverse_access_token: string | null }
  const accessToken = tenantRow.loyverse_access_token?.trim()
  if (!tenantRow.loyverse_enabled || !accessToken) {
    return syncFailure('Loyverse is not connected for this store')
  }

  let paymentTypes: LoyversePaymentType[]
  try {
    paymentTypes = await loyverseListAll<LoyversePaymentType>(
      accessToken,
      '/payment_types',
      'payment_types'
    )
  } catch (error: unknown) {
    if (error instanceof LoyverseApiError) {
      if (error.status === 401) return syncFailure('Loyverse rejected the access token (unauthorized)')
      if (error.status === 402) return syncFailure('The Loyverse subscription for this store has lapsed')
      return syncFailure(`Loyverse API error: ${error.message}`)
    }
    return syncFailure('Could not reach Loyverse')
  }

  const supabase = await createClient()
  const { data: existingRows, error: existingError } = await supabase
    .from('payment_methods')
    .select('id, name, is_active, order_index, loyverse_payment_type_id')
    .eq('tenant_id', tenantId)

  if (existingError) return syncFailure('Failed to read existing payment methods')

  const existing = (existingRows ?? []) as unknown as SyncablePaymentMethod[]
  const plan = planPaymentMethodSync(paymentTypes, existing)

  if (plan.creates.length > 0) {
    const rows = plan.creates.map((create) => ({ tenant_id: tenantId, ...create }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from('payment_methods').insert(rows as any)
    if (error) return syncFailure(`Failed to create payment methods: ${error.message}`)
  }

  for (const rename of plan.renames) {
    const { error } = await supabase
      .from('payment_methods')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ name: rename.name, updated_at: new Date().toISOString() } as any)
      .eq('id', rename.id)
      .eq('tenant_id', tenantId)
    if (error) return syncFailure(`Failed to rename payment method: ${error.message}`)
  }

  const liveness: Array<{ ids: string[]; is_active: boolean }> = [
    { ids: plan.reactivates, is_active: true },
    { ids: plan.deactivates, is_active: false },
  ]
  for (const { ids, is_active } of liveness) {
    if (ids.length === 0) continue
    const { error } = await supabase
      .from('payment_methods')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ is_active, updated_at: new Date().toISOString() } as any)
      .in('id', ids)
      .eq('tenant_id', tenantId)
    if (error) return syncFailure(`Failed to update payment method status: ${error.message}`)
  }

  return {
    success: true,
    created: plan.creates.length,
    renamed: plan.renames.length,
    reactivated: plan.reactivates.length,
    deactivated: plan.deactivates.length,
    warnings: plan.warnings,
  }
}
