/**
 * Payment Methods service for tenant admin operations
 */

import { createClient } from '@/lib/supabase/server'
import { verifyTenantAdmin } from '@/lib/admin-service'
import type { PaymentMethod } from '@/types/database'

export interface PaymentMethodWithOrderTypes extends PaymentMethod {
  order_types: string[] // Array of order_type_ids
}

// ============================================
// Payment Methods Operations
// ============================================

export async function getPaymentMethodsByTenant(tenantId: string) {
  await verifyTenantAdmin(tenantId)
  
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
  const paymentMethods = (data as Array<PaymentMethod & { payment_method_order_types: Array<{ order_type_id: string }> }>).map(pm => ({
    ...pm,
    order_types: pm.payment_method_order_types?.map((pmot: { order_type_id: string }) => pmot.order_type_id) || [],
    payment_method_order_types: undefined,
  }))
  
  return paymentMethods as PaymentMethodWithOrderTypes[]
}

export async function getPaymentMethodById(paymentMethodId: string, tenantId: string) {
  await verifyTenantAdmin(tenantId)
  
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
  const pm = data as PaymentMethod & { payment_method_order_types: Array<{ order_type_id: string }> }
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
  orderTypes: string[] = []
) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single()

  if (paymentMethodError) throw paymentMethodError

  const pm = paymentMethod as PaymentMethod

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
  }
) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('payment_methods')
    // @ts-expect-error - Supabase type inference issue with update
    .update(updates)
    .eq('id', paymentMethodId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as PaymentMethod
}

export async function updatePaymentMethodOrderTypes(
  paymentMethodId: string,
  tenantId: string,
  orderTypeIds: string[]
) {
  await verifyTenantAdmin(tenantId)
  
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
      // @ts-expect-error - Supabase type inference issue with insert
      .insert(associations)

    if (insertError) {
      throw insertError
    }
  }

  return { success: true }
}

export async function deletePaymentMethod(paymentMethodId: string, tenantId: string) {
  await verifyTenantAdmin(tenantId)
  
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
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()

  // Update order_index for each payment method
  const updates = paymentMethodIds.map((id, index) => 
    supabase
      .from('payment_methods')
      // @ts-expect-error - Supabase type inference issue with update
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
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('payment_methods')
    // @ts-expect-error - Supabase type inference issue with update
    .update({ is_active: isActive })
    .eq('id', paymentMethodId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as PaymentMethod
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
  return data as PaymentMethod[]
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

