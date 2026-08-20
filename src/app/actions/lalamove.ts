'use server'

/**
 * Server actions for Lalamove delivery integration
 */

import { createClient } from '@/lib/supabase/server'
import {
  createLalamoveQuotation,
  createLalamoveOrder,
  cancelLalamoveOrder,
  retrieveLalamoveQuotation,
} from '@/lib/lalamove-service'
import { normalizeLalamovePhone } from '@/lib/lalamove-phone'
import { resolveLalamoveSender } from '@/lib/lalamove-sender'
import { isLalamoveFinal } from '@/lib/lalamove-status'
import { checkRateLimit } from '@/lib/rate-limit'
import type { Tenant } from '@/types/database'

/**
 * The tenant columns Lalamove work actually needs. Several of these actions
 * are reachable from anonymous checkout traffic, so the row must be named
 * column by column — a select('*') drags every secret on the tenants table
 * into an anon-reachable code path.
 */
const LALAMOVE_TENANT_COLUMNS =
  'id, name, footer_business_name, footer_phone, footer_whatsapp, ' +
  'lalamove_enabled, lalamove_api_key, lalamove_secret_key, lalamove_market, ' +
  'lalamove_service_type, lalamove_sandbox, lalamove_sender_phone'

/**
 * Quotations are billable calls against the tenant's own Lalamove account and
 * the action is deliberately anonymous (customers quote at checkout). The cap
 * is per tenant: high enough for a busy dinner rush, low enough that a
 * scripted visitor cannot burn a merchant's account.
 */
const QUOTATION_RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 }

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
    const rate = checkRateLimit(`lalamove-quote:${tenantId}`, QUOTATION_RATE_LIMIT)
    if (!rate.allowed) {
      return {
        success: false,
        error: 'Too many delivery quotes requested. Please try again in a moment.',
      }
    }

    // Get tenant data
    const supabase = await createClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select(LALAMOVE_TENANT_COLUMNS)
      .eq('id', tenantId)
      .single()

    if (error || !tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    // Check if Lalamove is enabled
    const tenantTyped = tenant as unknown as Tenant
    if (!tenantTyped.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is not enabled for this restaurant' }
    }

    // Create quotation
    const quotation = await createLalamoveQuotation(
      tenantTyped,
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
      .select(LALAMOVE_TENANT_COLUMNS)
      .eq('id', tenantId)
      .single()

    if (!tenant || !(tenant as unknown as Tenant).lalamove_enabled) {
      return { valid: false, error: 'Lalamove not enabled' }
    }

    const quotation = await retrieveLalamoveQuotation(tenant as unknown as Tenant, quotationId)
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
    const { verifyTenantPermission } = await import('@/lib/admin-service')
    await verifyTenantPermission(tenantId, 'orders')

    const supabase = await createClient()

    // Get tenant data
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(LALAMOVE_TENANT_COLUMNS)
      .eq('id', tenantId)
      .single()

    if (tenantError || !tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const tenantTyped = tenant as unknown as Tenant
    if (!tenantTyped.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is not enabled' }
    }

    // Check if order already has a Lalamove order ID to prevent double booking
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('lalamove_order_id')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
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

    // Resolve the sender (pickup) contact from the tenant — the driver calls
    // this number for pickup, so it must be the STORE's number, not the
    // customer's. The senderName/senderPhone params are ignored in favor of the
    // authoritative tenant record to prevent the historical "driver calls
    // customer for pickup" bug.
    const sender = resolveLalamoveSender(tenantTyped)
    const normalizedRecipientPhone = normalizeLalamovePhone(recipientPhone, tenantTyped.lalamove_market)

    // Create Lalamove order
    const lalamoveOrder = await createLalamoveOrder(
      tenantTyped,
      quotationId,
      sender.name || senderName,
      sender.phone || normalizeLalamovePhone(senderPhone, tenantTyped.lalamove_market) || senderPhone,
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
    const { verifyTenantPermission } = await import('@/lib/admin-service')
    await verifyTenantPermission(tenantId, 'orders')

    const supabase = await createClient()

    // Get tenant data
    const { data: tenant } = await supabase
      .from('tenants')
      .select(LALAMOVE_TENANT_COLUMNS)
      .eq('id', tenantId)
      .single()

    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const tenantTyped = tenant as unknown as Tenant
    if (!tenantTyped.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is not enabled' }
    }

    // Get order from Lalamove
    const { getLalamoveOrder } = await import('@/lib/lalamove-service')
    const lalamoveOrder = (await getLalamoveOrder(tenantTyped, lalamoveOrderId)) as {
      status?: string
      shareLink?: string
      driverId?: string
      driver?: { id?: string; name?: string; phone?: string }
    }

    // Only fields Lalamove actually returned are written. Blanking a tracking
    // url or driver name because one poll came back thin would wipe details a
    // merchant needs for a delivery already on the road.
    const updateData: Record<string, unknown> = {}
    if (lalamoveOrder?.status) updateData.lalamove_status = lalamoveOrder.status
    if (lalamoveOrder?.shareLink) updateData.lalamove_tracking_url = lalamoveOrder.shareLink

    // The driver arrives in one of two shapes depending on API/SDK version:
    // embedded on the order payload, or as a driverId to fetch separately.
    if (lalamoveOrder?.driver?.name) updateData.lalamove_driver_name = lalamoveOrder.driver.name
    if (lalamoveOrder?.driver?.phone) updateData.lalamove_driver_phone = lalamoveOrder.driver.phone
    if (lalamoveOrder?.driver?.id) updateData.lalamove_driver_id = lalamoveOrder.driver.id

    const driverId = lalamoveOrder?.driverId
    if (driverId && !lalamoveOrder?.driver) {
      const { getLalamoveDriver } = await import('@/lib/lalamove-service')
      try {
        const driver = (await getLalamoveDriver(tenantTyped, lalamoveOrderId, driverId)) as {
          id?: string
          name?: string
          phone?: string
        }
        updateData.lalamove_driver_id = driver.id || driverId
        if (driver.name) updateData.lalamove_driver_name = driver.name
        if (driver.phone) updateData.lalamove_driver_phone = driver.phone
      } catch (driverError) {
        console.error('Failed to get driver info:', driverError)
        // Continue without driver info
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId)
        .eq('tenant_id', tenantId)

      if (updateError) {
        throw updateError
      }
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
 * Add a priority fee (tip) to an existing Lalamove order.
 */
export async function addPriorityFeeAction(
  tenantId: string,
  lalamoveOrderId: string,
  amount: string
) {
  try {
    const { verifyTenantPermission } = await import('@/lib/admin-service')
    await verifyTenantPermission(tenantId, 'orders')

    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { success: false, error: 'Invalid priority fee amount' }
    }

    const supabase = await createClient()
    const { data: tenant } = await supabase
      .from('tenants')
      .select(LALAMOVE_TENANT_COLUMNS)
      .eq('id', tenantId)
      .single()

    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const tenantTyped = tenant as unknown as Tenant
    if (!tenantTyped.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is not enabled' }
    }

    const { addLalamovePriorityFee } = await import('@/lib/lalamove-service')
    await addLalamovePriorityFee(tenantTyped, lalamoveOrderId, String(parsed))

    return { success: true }
  } catch (error) {
    console.error('Lalamove priority fee error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add priority fee',
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
    const { verifyTenantPermission } = await import('@/lib/admin-service')
    await verifyTenantPermission(tenantId, 'orders')

    const supabase = await createClient()

    // Get tenant data
    const { data: tenant } = await supabase
      .from('tenants')
      .select(LALAMOVE_TENANT_COLUMNS)
      .eq('id', tenantId)
      .single()

    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const tenantTyped = tenant as unknown as Tenant
    if (!tenantTyped.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is not enabled' }
    }

    // A finished delivery cannot be cancelled — Lalamove would reject it, and
    // blindly stamping CANCELLED over DELIVERED rewrites what actually
    // happened to the order.
    const { data: existing } = await supabase
      .from('orders')
      .select('lalamove_status')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single()

    const currentStatus = (existing as { lalamove_status?: string | null } | null)?.lalamove_status
    if (isLalamoveFinal(currentStatus)) {
      return {
        success: false,
        error: 'This delivery has already finished and cannot be cancelled',
      }
    }

    // Cancel order in Lalamove
    await cancelLalamoveOrder(tenantTyped, lalamoveOrderId)

    // Update order in database
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        lalamove_status: 'CANCELLED',
      })
      .eq('id', orderId)
      .eq('tenant_id', tenantId)

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

