'use server'

import { revalidatePath } from 'next/cache'
import {
  getPaymentMethodsByTenant,
  getPaymentMethodById,
  createPaymentMethod,
  updatePaymentMethod,
  updatePaymentMethodOrderTypes,
  deletePaymentMethod,
  reorderPaymentMethods,
  togglePaymentMethodStatus,
} from '@/lib/payment-methods-service'

export async function getPaymentMethodsAction(tenantId: string) {
  try {
    const paymentMethods = await getPaymentMethodsByTenant(tenantId)
    return { success: true, data: paymentMethods }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch payment methods' }
  }
}

export async function getPaymentMethodAction(paymentMethodId: string, tenantId: string) {
  try {
    const paymentMethod = await getPaymentMethodById(paymentMethodId, tenantId)
    return { success: true, data: paymentMethod }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch payment method' }
  }
}

export async function createPaymentMethodAction(
  tenantId: string,
  tenantSlug: string,
  name: string,
  details?: string,
  qrCodeUrl?: string,
  isActive: boolean = true,
  orderTypes: string[] = []
) {
  try {
    const paymentMethod = await createPaymentMethod(tenantId, name, details, qrCodeUrl, isActive, orderTypes)
    revalidatePath(`/${tenantSlug}/admin/payment-methods`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true, data: paymentMethod }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create payment method' }
  }
}

export async function updatePaymentMethodAction(
  paymentMethodId: string,
  tenantId: string,
  tenantSlug: string,
  updates: {
    name?: string
    details?: string
    qr_code_url?: string
    is_active?: boolean
  }
) {
  try {
    const paymentMethod = await updatePaymentMethod(paymentMethodId, tenantId, updates)
    revalidatePath(`/${tenantSlug}/admin/payment-methods`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true, data: paymentMethod }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update payment method' }
  }
}

export async function updatePaymentMethodOrderTypesAction(
  paymentMethodId: string,
  tenantId: string,
  tenantSlug: string,
  orderTypeIds: string[]
) {
  try {
    await updatePaymentMethodOrderTypes(paymentMethodId, tenantId, orderTypeIds)
    
    revalidatePath(`/${tenantSlug}/admin/payment-methods`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true }
  } catch (error) {
    console.error('Error in updatePaymentMethodOrderTypesAction:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update payment method order types' }
  }
}

export async function deletePaymentMethodAction(
  paymentMethodId: string,
  tenantId: string,
  tenantSlug: string
) {
  try {
    await deletePaymentMethod(paymentMethodId, tenantId)
    revalidatePath(`/${tenantSlug}/admin/payment-methods`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete payment method' }
  }
}

export async function reorderPaymentMethodsAction(
  tenantId: string,
  tenantSlug: string,
  paymentMethodIds: string[]
) {
  try {
    await reorderPaymentMethods(tenantId, paymentMethodIds)
    revalidatePath(`/${tenantSlug}/admin/payment-methods`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to reorder payment methods' }
  }
}

export async function togglePaymentMethodStatusAction(
  paymentMethodId: string,
  tenantId: string,
  tenantSlug: string,
  isActive: boolean
) {
  try {
    const paymentMethod = await togglePaymentMethodStatus(paymentMethodId, tenantId, isActive)
    revalidatePath(`/${tenantSlug}/admin/payment-methods`)
    revalidatePath(`/${tenantSlug}/admin`)
    revalidatePath(`/${tenantSlug}/checkout`)
    return { success: true, data: paymentMethod }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle payment method status' }
  }
}

