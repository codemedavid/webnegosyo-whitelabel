'use server'

import { revalidatePath } from 'next/cache'
import {
  getOrderTypesByTenant,
  getOrderTypeById,
  createOrderType,
  updateOrderType,
  deleteOrderType,
  toggleOrderTypeEnabled,
  getCustomerFormFieldsByOrderType,
  getCustomerFormFieldById,
  createCustomerFormField,
  updateCustomerFormField,
  deleteCustomerFormField,
  reorderCustomerFormFields,
  getAllOrderTypesWithFormFields,
} from '@/lib/order-types-service'

// ============================================
// Order Types Actions
// ============================================

export async function getOrderTypesAction(tenantId: string) {
  try {
    const orderTypes = await getOrderTypesByTenant(tenantId)
    return { success: true, data: orderTypes }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch order types' }
  }
}

export async function getOrderTypeAction(orderTypeId: string, tenantId: string) {
  try {
    const orderType = await getOrderTypeById(orderTypeId, tenantId)
    return { success: true, data: orderType }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch order type' }
  }
}

export async function createOrderTypeAction(
  tenantId: string,
  tenantSlug: string,
  input: {
    type: 'dine_in' | 'pickup' | 'delivery'
    name: string
    description?: string
    is_enabled?: boolean
    order_index?: number
  }
) {
  try {
    const orderType = await createOrderType(tenantId, {
      ...input,
      is_enabled: input.is_enabled ?? true,
      order_index: input.order_index ?? 0,
    })
    revalidatePath(`/${tenantSlug}/admin/order-types`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true, data: orderType }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create order type' }
  }
}

export async function updateOrderTypeAction(
  orderTypeId: string,
  tenantId: string,
  tenantSlug: string,
  input: {
    type: 'dine_in' | 'pickup' | 'delivery'
    name: string
    description?: string
    is_enabled?: boolean
    order_index?: number
  }
) {
  try {
    const orderType = await updateOrderType(orderTypeId, tenantId, {
      ...input,
      is_enabled: input.is_enabled ?? true,
      order_index: input.order_index ?? 0,
    })
    revalidatePath(`/${tenantSlug}/admin/order-types`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true, data: orderType }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update order type' }
  }
}

export async function deleteOrderTypeAction(orderTypeId: string, tenantId: string, tenantSlug: string) {
  try {
    await deleteOrderType(orderTypeId, tenantId)
    revalidatePath(`/${tenantSlug}/admin/order-types`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete order type' }
  }
}

export async function toggleOrderTypeEnabledAction(
  orderTypeId: string,
  tenantId: string,
  tenantSlug: string,
  enabled: boolean
) {
  try {
    const orderType = await toggleOrderTypeEnabled(orderTypeId, tenantId, enabled)
    revalidatePath(`/${tenantSlug}/admin/order-types`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true, data: orderType }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle order type' }
  }
}

// ============================================
// Customer Form Fields Actions
// ============================================

export async function getCustomerFormFieldsAction(orderTypeId: string, tenantId: string) {
  try {
    const fields = await getCustomerFormFieldsByOrderType(orderTypeId, tenantId)
    return { success: true, data: fields }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch form fields' }
  }
}

export async function getCustomerFormFieldAction(fieldId: string, tenantId: string) {
  try {
    const field = await getCustomerFormFieldById(fieldId, tenantId)
    return { success: true, data: field }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch form field' }
  }
}

export async function createCustomerFormFieldAction(
  tenantId: string,
  tenantSlug: string,
  orderTypeId: string,
  input: {
    field_name: string
    field_label: string
    field_type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'number'
    is_required?: boolean
    placeholder?: string
    validation_rules?: Record<string, unknown>
    options?: string[]
    order_index?: number
  }
) {
  try {
    const field = await createCustomerFormField(tenantId, orderTypeId, {
      ...input,
      is_required: input.is_required ?? false,
      order_index: input.order_index ?? 0,
    })
    revalidatePath(`/${tenantSlug}/admin/order-types`)
    revalidatePath(`/${tenantSlug}/admin/order-types/${orderTypeId}`)
    return { success: true, data: field }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create form field' }
  }
}

export async function updateCustomerFormFieldAction(
  fieldId: string,
  tenantId: string,
  tenantSlug: string,
  orderTypeId: string,
  input: {
    field_name: string
    field_label: string
    field_type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'number'
    is_required?: boolean
    placeholder?: string
    validation_rules?: Record<string, unknown>
    options?: string[]
    order_index?: number
  }
) {
  try {
    const field = await updateCustomerFormField(fieldId, tenantId, {
      ...input,
      is_required: input.is_required ?? false,
      order_index: input.order_index ?? 0,
    })
    revalidatePath(`/${tenantSlug}/admin/order-types`)
    revalidatePath(`/${tenantSlug}/admin/order-types/${orderTypeId}`)
    return { success: true, data: field }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update form field' }
  }
}

export async function deleteCustomerFormFieldAction(
  fieldId: string,
  tenantId: string,
  tenantSlug: string,
  orderTypeId: string
) {
  try {
    await deleteCustomerFormField(fieldId, tenantId)
    revalidatePath(`/${tenantSlug}/admin/order-types`)
    revalidatePath(`/${tenantSlug}/admin/order-types/${orderTypeId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete form field' }
  }
}

export async function reorderCustomerFormFieldsAction(
  fieldIds: string[],
  tenantId: string,
  tenantSlug: string
) {
  try {
    await reorderCustomerFormFields(fieldIds, tenantId)
    revalidatePath(`/${tenantSlug}/admin/order-types`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to reorder form fields' }
  }
}

// ============================================
// Combined Actions
// ============================================

export async function getAllOrderTypesWithFormFieldsAction(tenantId: string) {
  try {
    const orderTypes = await getAllOrderTypesWithFormFields(tenantId)
    return { success: true, data: orderTypes }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch order types with form fields' }
  }
}
