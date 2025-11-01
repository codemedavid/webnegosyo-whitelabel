'use server'

/**
 * Server actions for Lalamove delivery integration
 */

import { createClient } from '@/lib/supabase/server'
import { 
  createLalamoveQuotation, 
  createLalamoveOrder,
  cancelLalamoveOrder 
} from '@/lib/lalamove-service'
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

/**
 * Check if quotation is still valid (not expired)
 * Quotations are valid for 5 minutes per Lalamove documentation
 */
export async function checkQuotationValidity(
  tenantId: string,
  quotationId: string
): Promise<{ valid: boolean; expiresAt?: Date; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (!tenant || !(tenant as Tenant).lalamove_enabled) {
      return { valid: false, error: 'Lalamove not enabled' }
    }

    // Retrieve quotation from Lalamove to check expiry
    const SDKClient = await import('@lalamove/lalamove-js')
    const environment = (tenant as Tenant).lalamove_sandbox ? 'sandbox' : 'production'
    const market = (tenant as Tenant).lalamove_market || 'HK'
    
    const client = new SDKClient.ClientModule(
      new SDKClient.Config(
        (tenant as Tenant).lalamove_api_key!,
        (tenant as Tenant).lalamove_secret_key!,
        environment
      )
    )

    const quotation = await client.Quotation.retrieve(market, quotationId)
    const expiresAt = new Date(quotation.expiresAt)
    const now = new Date()
    const valid = expiresAt > now

    if (!valid) {
      const timeDiff = now.getTime() - expiresAt.getTime()
      const minutesExpired = Math.floor(timeDiff / 60000)
      return { 
        valid: false, 
        expiresAt,
        error: `Quotation expired ${minutesExpired} minute(s) ago` 
      }
    }

    return { valid, expiresAt }
  } catch (error) {
    console.error('Quotation validity check error:', error)
    // If we can't retrieve the quotation, don't block - let Lalamove API handle it
    // This is especially important in sandbox where quotation retrieval might fail
    const errorMessage = error instanceof Error ? error.message : 'Failed to check quotation validity'
    
    // If it's a 404 or similar, the quotation might not exist - we'll let Lalamove API reject it
    // Otherwise, we'll proceed and let Lalamove validate
    if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      return { 
        valid: false, 
        error: 'Quotation not found' 
      }
    }
    
    // For other errors, return valid: false but with a warning that we'll still try
    return { 
      valid: false, 
      error: `Could not verify quotation validity: ${errorMessage}. Will attempt creation anyway.` 
    }
  }
}

/**
 * Create a Lalamove delivery order from a quotation
 * This should be called when an order is confirmed
 */
export async function createLalamoveOrderAction(
  tenantId: string,
  orderId: string,
  quotationId: string,
  senderName: string,
  senderPhone: string,
  recipientName: string,
  recipientPhone: string,
  metadata?: Record<string, unknown>
) {
  try {
    const supabase = await createClient()
    
    // Get tenant data
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (tenantError || !tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const tenantTyped = tenant as Tenant
    if (!tenantTyped.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is not enabled' }
    }

    // Check if order already has a Lalamove order ID to prevent double booking
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('lalamove_order_id')
      .eq('id', orderId)
      .single()

    if (existingOrder && (existingOrder as { lalamove_order_id?: string | null }).lalamove_order_id) {
      const existingId = (existingOrder as { lalamove_order_id: string }).lalamove_order_id
      if (existingId && String(existingId).trim() !== '') {
        return { 
          success: false, 
          error: `Lalamove order already exists with ID: ${existingId}` 
        }
      }
    }

    // Check quotation validity first (5 minute expiry)
    // In sandbox mode, be more lenient - let Lalamove API validate instead of blocking here
    const validityCheck = await checkQuotationValidity(tenantId, quotationId)
    
    // Only block if we're in production and quotation is definitely expired
    // In sandbox, we'll let Lalamove API tell us if quotation is invalid
    if (!validityCheck.valid && !tenantTyped.lalamove_sandbox) {
      // In production, block expired quotations
      return { 
        success: false, 
        error: validityCheck.error || 'Quotation has expired. Please create a new quotation.' 
      }
    }
    
    // In sandbox or if validity check failed, log warning but proceed
    // Lalamove API will reject if quotation is truly expired
    if (!validityCheck.valid) {
      console.warn('Quotation validity check failed, but proceeding in sandbox mode:', validityCheck.error)
    }

    // Normalize phone numbers to E.164; default to +63 for PH market per Lalamove phone rules
    function normalizePhone(phone: string | undefined, market: string | undefined): string | undefined {
      if (!phone) return undefined
      const trimmed = String(phone).trim()
      if (trimmed.startsWith('+')) return trimmed
      const digits = trimmed.replace(/\D/g, '')
      if (!digits) return undefined
      const isPH = (market || '').toUpperCase() === 'PH'
      if (isPH) {
        // Common inputs: 09xxxxxxxxx, 9xxxxxxxxx, 639xxxxxxxxx
        if (digits.startsWith('63')) return `+${digits}`
        if (digits.startsWith('0')) return `+63${digits.slice(1)}`
        if (digits.length === 10 && digits.startsWith('9')) return `+63${digits}`
        return `+63${digits}`
      }
      // Fallback: return with + prefix if a country code seems present
      return `+${digits}`
    }

    const normalizedSenderPhone = normalizePhone(senderPhone, tenantTyped.lalamove_market)
    const normalizedRecipientPhone = normalizePhone(recipientPhone, tenantTyped.lalamove_market)

    // Create Lalamove order
    const lalamoveOrder = await createLalamoveOrder(
      tenantTyped,
      quotationId,
      senderName,
      normalizedSenderPhone || senderPhone,
      recipientName,
      normalizedRecipientPhone || recipientPhone,
      {
        ...metadata,
        orderId,
        tenantId,
      }
    )

    // Update order in database with Lalamove order details
    // Use a conditional update to prevent overwriting if another process already created it
    const { error: updateError } = await supabase
      .from('orders')
      // @ts-expect-error - Supabase type inference issue with update
      .update({
        lalamove_order_id: lalamoveOrder.orderId,
        lalamove_status: lalamoveOrder.status,
        lalamove_tracking_url: lalamoveOrder.shareLink,
      })
      .eq('id', orderId)
      .is('lalamove_order_id', null) // Only update if lalamove_order_id is null

    if (updateError) {
      console.error('Failed to update order with Lalamove info:', updateError)
      // Don't fail the whole operation, order was created in Lalamove
    }

    return {
      success: true,
      data: lalamoveOrder,
    }
  } catch (error) {
    console.error('Lalamove order creation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create Lalamove order',
    }
  }
}

/**
 * Get Lalamove order details and sync with database
 */
export async function syncLalamoveOrderAction(
  tenantId: string,
  orderId: string,
  lalamoveOrderId: string
) {
  try {
    const supabase = await createClient()
    
    // Get tenant data
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const tenantTyped = tenant as Tenant
    if (!tenantTyped.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is not enabled' }
    }

    // Get order from Lalamove
    const { getLalamoveOrder } = await import('@/lib/lalamove-service')
    const lalamoveOrder = await getLalamoveOrder(tenantTyped, lalamoveOrderId)

    // Update order in database
    // The SDK returns an order object with status, shareLink, driverId, etc.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lalamoveOrderData = lalamoveOrder as any
    const updateData: Record<string, unknown> = {
      lalamove_status: lalamoveOrderData.status || null,
      lalamove_tracking_url: lalamoveOrderData.shareLink || null,
    }

    // Update driver info if available
    const driverId = lalamoveOrderData.driverId
    if (driverId) {
      const { getLalamoveDriver } = await import('@/lib/lalamove-service')
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const driver = await getLalamoveDriver(tenantTyped, lalamoveOrderId, driverId) as any
        updateData.lalamove_driver_id = driver.id || driverId
        updateData.lalamove_driver_name = driver.name || null
        updateData.lalamove_driver_phone = driver.phone || null
      } catch (driverError) {
        console.error('Failed to get driver info:', driverError)
        // Continue without driver info
      }
    }

    const { error: updateError } = await supabase
      .from('orders')
      // @ts-expect-error - Supabase type inference issue with update
      .update(updateData)
      .eq('id', orderId)

    if (updateError) {
      throw updateError
    }

    return {
      success: true,
      data: {
        ...lalamoveOrder,
        ...updateData,
      },
    }
  } catch (error) {
    console.error('Lalamove order sync error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync Lalamove order',
    }
  }
}

/**
 * Cancel a Lalamove delivery order
 */
export async function cancelLalamoveOrderAction(
  tenantId: string,
  orderId: string,
  lalamoveOrderId: string
) {
  try {
    const supabase = await createClient()
    
    // Get tenant data
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const tenantTyped = tenant as Tenant
    if (!tenantTyped.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is not enabled' }
    }

    // Cancel order in Lalamove
    await cancelLalamoveOrder(tenantTyped, lalamoveOrderId)

    // Update order in database
    const { error: updateError } = await supabase
      .from('orders')
      // @ts-expect-error - Supabase type inference issue with update
      .update({
        lalamove_status: 'CANCELLED',
      })
      .eq('id', orderId)

    if (updateError) {
      throw updateError
    }

    return {
      success: true,
    }
  } catch (error) {
    console.error('Lalamove order cancellation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel Lalamove order',
    }
  }
}

