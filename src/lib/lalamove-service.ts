'use server'

/**
 * Lalamove Delivery Integration Service
 * Based on official SDK: https://github.com/lalamove/delivery-nodejs-sdk
 * Documentation: https://developers.lalamove.com
 */

import type { Tenant } from '@/types/database'

// Re-export types from SDK for easier access
export interface LalamoveCoordinates {
  lat: string
  lng: string
}

export interface LalamoveStop {
  coordinates: LalamoveCoordinates
  address: string
  name?: string
  phone?: string
  stopId?: string
}

/**
 * Get language code for Lalamove based on market
 */
function getLanguageForMarket(market: string): string {
  const marketLanguageMap: Record<string, string> = {
    HK: 'en_HK',
    SG: 'en_SG',
    TH: 'th_TH',
    PH: 'en_PH',
    TW: 'zh_TW',
    MY: 'ms_MY',
    VN: 'vi_VN',
  }
  return marketLanguageMap[market] || 'en_US'
}
async function getLalamoveSDK() {
  try {
    // Dynamic import to avoid SSR issues
    const SDKClient = await import('@lalamove/lalamove-js')
    return SDKClient
  } catch (error) {
    console.error('Failed to load Lalamove SDK:', error)
    throw new Error('Lalamove SDK not available')
  }
}

/**
 * Initialize Lalamove client with tenant credentials
 */
async function initLalamoveClient(tenant: Tenant) {
  if (!tenant.lalamove_enabled || !tenant.lalamove_api_key || !tenant.lalamove_secret_key) {
    throw new Error('Lalamove is not configured for this tenant')
  }

  const SDKClient = await getLalamoveSDK()
  const environment = tenant.lalamove_sandbox ? 'sandbox' : 'production'
  
  console.log('[Lalamove] Initializing client:', {
    environment,
    hasApiKey: !!tenant.lalamove_api_key,
    hasSecretKey: !!tenant.lalamove_secret_key,
    apiKeyPrefix: tenant.lalamove_api_key.substring(0, 8) + '...',
    market: tenant.lalamove_market,
  })
  
  return new SDKClient.ClientModule(
    new SDKClient.Config(
      tenant.lalamove_api_key,
      tenant.lalamove_secret_key,
      environment
    )
  )
}

/**
 * Create a quotation for delivery
 * Returns the quote ID, price, and expiry time
 */
export async function createLalamoveQuotation(
  tenant: Tenant,
  pickupAddress: string,
  pickupCoordinates: { lat: number; lng: number },
  deliveryAddress: string,
  deliveryCoordinates: { lat: number; lng: number },
  serviceType?: string
): Promise<{
  quotationId: string
  price: number
  currency: string
  expiresAt: Date
  distance: string
  duration: string
}> {
  try {
    const client = await initLalamoveClient(tenant)
    const market = tenant.lalamove_market || 'HK'
    const service = serviceType || tenant.lalamove_service_type || 'MOTORCYCLE'

    console.log('[Lalamove] Creating quotation:', {
      market,
      service,
      pickupAddress,
      deliveryAddress,
      pickupCoords: pickupCoordinates,
      deliveryCoords: deliveryCoordinates,
    })

    // Build stops array (pickup + delivery)
    const stop1: LalamoveStop = {
      coordinates: {
        lat: pickupCoordinates.lat.toString(),
        lng: pickupCoordinates.lng.toString(),
      },
      address: pickupAddress,
    }

    const stop2: LalamoveStop = {
      coordinates: {
        lat: deliveryCoordinates.lat.toString(),
        lng: deliveryCoordinates.lng.toString(),
      },
      address: deliveryAddress,
    }

    // Build quotation payload using SDK's builder
    const SDKClient = await getLalamoveSDK()
    const language = getLanguageForMarket(market)
    const quotationPayload = SDKClient.QuotationPayloadBuilder.quotationPayload()
      .withLanguage(language)
      .withServiceType(service)
      .withStops([stop1, stop2])
      .build()

    console.log('[Lalamove] Quotation payload:', JSON.stringify(quotationPayload, null, 2))

    // Create quotation
    const quotation = await client.Quotation.create(
      market,
      quotationPayload
    )

    console.log('[Lalamove] Quotation created:', quotation.id)

    return {
      quotationId: quotation.id,
      price: parseFloat(quotation.priceBreakdown.total || '0'),
      currency: quotation.priceBreakdown.currency,
      expiresAt: new Date(quotation.expiresAt),
      distance: '0 km', // Not provided in price breakdown
      duration: '0 min', // Not provided in price breakdown
    }
  } catch (error) {
    console.error('[Lalamove] Quotation error:', error)
    throw new Error(
      error instanceof Error
        ? `Failed to create Lalamove quotation: ${error.message}`
        : 'Failed to create Lalamove quotation'
    )
  }
}

/**
 * Create a Lalamove order from a quotation
 */
export async function createLalamoveOrder(
  tenant: Tenant,
  quotationId: string,
  senderName: string,
  senderPhone: string,
  recipientName: string,
  recipientPhone: string,
  metadata?: Record<string, unknown>
): Promise<{
  orderId: string
  status: string
  shareLink: string
  driverId?: string
}> {
  try {
    const client = await initLalamoveClient(tenant)
    const market = tenant.lalamove_market || 'HK'

    // Retrieve quotation to get stop IDs
    const quotation = await client.Quotation.retrieve(
      market,
      quotationId
    )

    // Build order payload using SDK's builder
    const SDKClient = await getLalamoveSDK()
    const orderPayload = SDKClient.OrderPayloadBuilder.orderPayload()
      .withIsPODEnabled(true)
      .withQuotationID(quotationId)
      .withSender({
        stopId: quotation.stops[0].id || '',
        name: senderName,
        phone: senderPhone,
      })
      .withRecipients([
        {
          stopId: quotation.stops[1].id || '',
          name: recipientName,
          phone: recipientPhone,
          remarks: '',
        },
      ])
      .withMetadata(metadata || {})
      .build()

    // Create order
    const order = await client.Order.create(market, orderPayload)

    return {
      orderId: order.id,
      status: order.status,
      shareLink: order.shareLink,
      driverId: order.driverId,
    }
  } catch (error) {
    console.error('Lalamove order creation error:', error)
    throw new Error(
      error instanceof Error
        ? `Failed to create Lalamove order: ${error.message}`
        : 'Failed to create Lalamove order'
    )
  }
}

/**
 * Retrieve Lalamove driver information
 */
export async function getLalamoveDriver(
  tenant: Tenant,
  orderId: string,
  driverId: string
) {
  try {
    const client = await initLalamoveClient(tenant)
    const market = tenant.lalamove_market || 'HK'

    const driver = await client.Driver.retrieve(
      market,
      driverId,
      orderId
    )

    return driver
  } catch (error) {
    console.error('Lalamove driver retrieval error:', error)
    throw new Error(
      error instanceof Error
        ? `Failed to retrieve driver: ${error.message}`
        : 'Failed to retrieve driver'
    )
  }
}

/**
 * Retrieve Lalamove order details
 */
export async function getLalamoveOrder(
  tenant: Tenant,
  orderId: string
) {
  try {
    const client = await initLalamoveClient(tenant)
    const market = tenant.lalamove_market || 'HK'

    const order = await client.Order.retrieve(market, orderId)

    return order
  } catch (error) {
    console.error('Lalamove order retrieval error:', error)
    throw new Error(
      error instanceof Error
        ? `Failed to retrieve order: ${error.message}`
        : 'Failed to retrieve order'
    )
  }
}

/**
 * Cancel a Lalamove order
 */
export async function cancelLalamoveOrder(
  tenant: Tenant,
  orderId: string
): Promise<boolean> {
  try {
    const client = await initLalamoveClient(tenant)
    const market = tenant.lalamove_market || 'HK'

    await client.Order.cancel(market, orderId)

    return true
  } catch (error) {
    console.error('Lalamove order cancellation error:', error)
    throw new Error(
      error instanceof Error
        ? `Failed to cancel order: ${error.message}`
        : 'Failed to cancel order'
    )
  }
}

