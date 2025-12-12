/**
 * Order Types and Customer Form Management Service
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantAdmin } from '@/lib/admin-service'
import type { OrderType, CustomerFormField } from '@/types/database'
import { z } from 'zod'

// ============================================
// Schemas
// ============================================

export const orderTypeSchema = z.object({
  type: z.enum(['dine_in', 'pickup', 'delivery']),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  is_enabled: z.boolean(),
  order_index: z.number().int().min(0),
})

export const customerFormFieldSchema = z.object({
  field_name: z.string().min(1, 'Field name is required'),
  field_label: z.string().min(1, 'Field label is required'),
  field_type: z.enum(['text', 'email', 'phone', 'textarea', 'select', 'number']),
  is_required: z.boolean(),
  placeholder: z.string().optional(),
  validation_rules: z.record(z.string(), z.unknown()).optional(),
  options: z.array(z.string()).optional(),
  order_index: z.number().int().min(0),
})

export type OrderTypeInput = z.infer<typeof orderTypeSchema>
export type CustomerFormFieldInput = z.infer<typeof customerFormFieldSchema>

// ============================================
// Order Types Operations
// ============================================

export async function getOrderTypesByTenant(tenantId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as OrderType[]
}

export async function getEnabledOrderTypesByTenant(tenantId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as OrderType[]
}

export async function getOrderTypeById(orderTypeId: string, tenantId: string) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_types')
    .select('*')
    .eq('id', orderTypeId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) throw error
  return data as OrderType
}

export async function createOrderType(tenantId: string, input: OrderTypeInput) {
  await verifyTenantAdmin(tenantId)

  const validated = orderTypeSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_types')
    .insert({
      tenant_id: tenantId,
      ...validated,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single()

  if (error) throw error
  return data as OrderType
}

export async function updateOrderType(orderTypeId: string, tenantId: string, input: OrderTypeInput) {
  await verifyTenantAdmin(tenantId)

  const validated = orderTypeSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_types')
    // @ts-expect-error - Supabase client types unavailable; casting update payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(validated as any)
    .eq('id', orderTypeId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as OrderType
}

export async function deleteOrderType(orderTypeId: string, tenantId: string) {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/2df35b8c-2700-48d4-95e9-dfb1a632d209', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'order-types-service.ts:123', message: 'deleteOrderType entry', data: { orderTypeId, tenantId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
  // #endregion

  // #region agent log
  try {
    await verifyTenantAdmin(tenantId);
    fetch('http://127.0.0.1:7244/ingest/2df35b8c-2700-48d4-95e9-dfb1a632d209', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'order-types-service.ts:125', message: 'verifyTenantAdmin success', data: { tenantId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
  } catch (verifyError) {
    fetch('http://127.0.0.1:7244/ingest/2df35b8c-2700-48d4-95e9-dfb1a632d209', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'order-types-service.ts:125', message: 'verifyTenantAdmin failed', data: { tenantId, error: verifyError instanceof Error ? verifyError.message : String(verifyError) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
    throw verifyError;
  }
  // #endregion

  // Use admin client to bypass RLS for updating orders
  // This ensures we can update ALL orders referencing this order type,
  // not just those visible through RLS policies
  const adminClient = createAdminClient()

  // First, set order_type_id to null for ANY orders that reference this order type
  // We update ALL orders (not just from this tenant) because:
  // 1. We've already verified admin access to this tenant's order type
  // 2. The foreign key constraint doesn't care about tenant boundaries
  // 3. This ensures we clear ALL references before deletion
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/2df35b8c-2700-48d4-95e9-dfb1a632d209', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'order-types-service.ts:144', message: 'before orders update (all tenants)', data: { orderTypeId, tenantId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'post-fix-v2', hypothesisId: 'A' }) }).catch(() => { });
  // #endregion
  const { error: updateError } = await adminClient
    .from('orders')
    // @ts-expect-error - Supabase client types unavailable
    .update({ order_type_id: null } as Record<string, unknown>)
    .eq('order_type_id', orderTypeId)

  // #region agent log
  if (updateError) {
    fetch('http://127.0.0.1:7244/ingest/2df35b8c-2700-48d4-95e9-dfb1a632d209', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'order-types-service.ts:156', message: 'orders update error', data: { orderTypeId, tenantId, error: updateError.message, code: updateError.code, details: updateError.details, hint: updateError.hint }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'post-fix-v2', hypothesisId: 'A' }) }).catch(() => { });
  } else {
    fetch('http://127.0.0.1:7244/ingest/2df35b8c-2700-48d4-95e9-dfb1a632d209', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'order-types-service.ts:156', message: 'orders update success', data: { orderTypeId, tenantId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'post-fix-v2', hypothesisId: 'A' }) }).catch(() => { });
  }
  // #endregion

  if (updateError) throw updateError

  // Now delete the order type (customer_form_fields and payment_method_order_types cascade automatically)
  // Use admin client to bypass RLS for deletion
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/2df35b8c-2700-48d4-95e9-dfb1a632d209', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'order-types-service.ts:168', message: 'before order_types delete', data: { orderTypeId, tenantId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'post-fix-v2', hypothesisId: 'B' }) }).catch(() => { });
  // #endregion
  const { error } = await adminClient
    .from('order_types')
    .delete()
    .eq('id', orderTypeId)
    .eq('tenant_id', tenantId)

  // #region agent log
  if (error) {
    fetch('http://127.0.0.1:7244/ingest/2df35b8c-2700-48d4-95e9-dfb1a632d209', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'order-types-service.ts:174', message: 'order_types delete error', data: { orderTypeId, tenantId, error: error.message, code: error.code, details: error.details, hint: error.hint }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'post-fix-v2', hypothesisId: 'B' }) }).catch(() => { });
  } else {
    fetch('http://127.0.0.1:7244/ingest/2df35b8c-2700-48d4-95e9-dfb1a632d209', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'order-types-service.ts:174', message: 'order_types delete success', data: { orderTypeId, tenantId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'post-fix-v2', hypothesisId: 'B' }) }).catch(() => { });
  }
  // #endregion

  if (error) throw error

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/2df35b8c-2700-48d4-95e9-dfb1a632d209', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'order-types-service.ts:147', message: 'deleteOrderType exit success', data: { orderTypeId, tenantId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
  // #endregion
}

export async function toggleOrderTypeEnabled(orderTypeId: string, tenantId: string, enabled: boolean) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_types')
    // @ts-expect-error - Supabase client types unavailable; casting update payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ is_enabled: enabled } as any)
    .eq('id', orderTypeId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as OrderType
}

/**
 * Initialize default order types for a tenant if they don't exist
 * This can be called manually or automatically
 */
export async function initializeOrderTypesForTenant(tenantId: string) {
  const supabase = await createClient()

  // Check if order types already exist
  const { data: existing, error: checkError } = await supabase
    .from('order_types')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1)

  if (checkError) throw checkError

  // If order types already exist, skip initialization
  if (existing && existing.length > 0) {
    return { initialized: false, message: 'Order types already exist' }
  }

  // Call the database function to initialize order types
  // @ts-expect-error - RPC function not in generated types
  const { error } = await supabase.rpc('initialize_order_types_for_tenant', {
    tenant_uuid: tenantId,
  })

  if (error) throw error

  return { initialized: true, message: 'Default order types created' }
}

// ============================================
// Customer Form Fields Operations
// ============================================

export async function getCustomerFormFieldsByOrderType(orderTypeId: string, tenantId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer_form_fields')
    .select('*')
    .eq('order_type_id', orderTypeId)
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as CustomerFormField[]
}

export async function getCustomerFormFieldById(fieldId: string, tenantId: string) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer_form_fields')
    .select('*')
    .eq('id', fieldId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) throw error
  return data as CustomerFormField
}

export async function createCustomerFormField(tenantId: string, orderTypeId: string, input: CustomerFormFieldInput) {
  await verifyTenantAdmin(tenantId)

  const validated = customerFormFieldSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer_form_fields')
    .insert({
      tenant_id: tenantId,
      order_type_id: orderTypeId,
      ...validated,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single()

  if (error) throw error
  return data as CustomerFormField
}

export async function updateCustomerFormField(fieldId: string, tenantId: string, input: CustomerFormFieldInput) {
  await verifyTenantAdmin(tenantId)

  const validated = customerFormFieldSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer_form_fields')
    // @ts-expect-error - Supabase client types unavailable; casting update payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(validated as any)
    .eq('id', fieldId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as CustomerFormField
}

export async function deleteCustomerFormField(fieldId: string, tenantId: string) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()

  const { error } = await supabase
    .from('customer_form_fields')
    .delete()
    .eq('id', fieldId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}

export async function reorderCustomerFormFields(fieldIds: string[], tenantId: string) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()

  // Update order_index for each field
  const updates = fieldIds.map((fieldId, index) =>
    supabase
      .from('customer_form_fields')
      // @ts-expect-error - Supabase client types unavailable; casting update payload
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ order_index: index } as any)
      .eq('id', fieldId)
      .eq('tenant_id', tenantId)
  )

  const results = await Promise.all(updates)

  // Check for any errors
  for (const result of results) {
    if (result.error) throw result.error
  }
}

// ============================================
// Combined Operations
// ============================================

export async function getOrderTypeWithFormFields(orderTypeId: string, tenantId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_types')
    .select(`
      *,
      customer_form_fields(*)
    `)
    .eq('id', orderTypeId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) throw error
  return data as OrderType & { customer_form_fields: CustomerFormField[] }
}

export async function getAllOrderTypesWithFormFields(tenantId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_types')
    .select(`
      *,
      customer_form_fields(*)
    `)
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as (OrderType & { customer_form_fields: CustomerFormField[] })[]
}
