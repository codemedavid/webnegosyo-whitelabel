'use server'

/**
 * Server actions for Lalamove delivery integration
 */

import { createClient } from '@/lib/supabase/server'
import { createLalamoveQuotation } from '@/lib/lalamove-service'
import type { Tenant } from '@/types/database'

/**
 * Create a Lalamove quotation for delivery
 */
export async function createQuotationAction(
  tenantId: string,
  pickupAddress: string,
  pickupLat: number,
  pickupLng: number,
  deliveryAddress: string,
  deliveryLat: number,
  deliveryLng: number,
  serviceType?: string
) {
  try {
    // Get tenant data
    const supabase = await createClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (error || !tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    // Check if Lalamove is enabled
    const tenantTyped = tenant as Tenant
    if (!tenantTyped.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is not enabled for this restaurant' }
    }

    // Create quotation
    const quotation = await createLalamoveQuotation(
      tenant,
      pickupAddress,
      { lat: pickupLat, lng: pickupLng },
      deliveryAddress,
      { lat: deliveryLat, lng: deliveryLng },
      serviceType
    )

    return {
      success: true,
      data: quotation,
    }
  } catch (error) {
    console.error('Quotation creation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create quotation',
    }
  }
}

/**
 * Validate delivery address coordinates
 */
export async function validateDeliveryAddress(
  deliveryAddress: string,
  deliveryLat: string,
  deliveryLng: string
) {
  if (!deliveryAddress || !deliveryLat || !deliveryLng) {
    return {
      success: false,
      error: 'Delivery address and coordinates are required',
    }
  }

  const lat = parseFloat(deliveryLat)
  const lng = parseFloat(deliveryLng)

  if (isNaN(lat) || isNaN(lng)) {
    return {
      success: false,
      error: 'Invalid coordinates',
    }
  }

  return {
    success: true,
    data: {
      address: deliveryAddress,
      lat,
      lng,
    },
  }
}

