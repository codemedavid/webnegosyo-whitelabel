# Lalamove Integration - Complete Implementation Guide

## Overview

Complete Lalamove delivery integration with quotation and order creation. Supports sandbox and production environments.

## 1. Installation

```bash
npm install @lalamove/lalamove-js
```

## 2. Database Schema

```sql
-- Orders table
ALTER TABLE orders
ADD COLUMN delivery_fee NUMERIC(10,2) DEFAULT 0,
ADD COLUMN lalamove_quotation_id TEXT,
ADD COLUMN lalamove_order_id TEXT,
ADD COLUMN lalamove_status TEXT,
ADD COLUMN lalamove_driver_id TEXT,
ADD COLUMN lalamove_driver_name TEXT,
ADD COLUMN lalamove_driver_phone TEXT,
ADD COLUMN lalamove_tracking_url TEXT;

-- Tenants/Restaurants table
ALTER TABLE tenants
ADD COLUMN lalamove_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN lalamove_api_key TEXT,
ADD COLUMN lalamove_secret_key TEXT,
ADD COLUMN lalamove_market TEXT,
ADD COLUMN lalamove_service_type TEXT,
ADD COLUMN lalamove_sandbox BOOLEAN DEFAULT TRUE,
ADD COLUMN restaurant_address TEXT,
ADD COLUMN restaurant_latitude NUMERIC(10,8),
ADD COLUMN restaurant_longitude NUMERIC(11,8);
```

## 3. Core Service (`src/lib/lalamove-service.ts`)

```typescript
'use server'

import type { Tenant } from '@/types/database'

interface LalamoveStop {
  coordinates: { lat: string; lng: string }
  address: string
}

function getLanguageForMarket(market: string): string {
  const map: Record<string, string> = {
    HK: 'en_HK', SG: 'en_SG', TH: 'th_TH', PH: 'en_PH',
    TW: 'zh_TW', MY: 'ms_MY', VN: 'vi_VN'
  }
  return map[market] || 'en_US'
}

async function getLalamoveSDK() {
  const SDKClient = await import('@lalamove/lalamove-js')
  return SDKClient
}

async function initLalamoveClient(tenant: Tenant) {
  if (!tenant.lalamove_enabled || !tenant.lalamove_api_key || !tenant.lalamove_secret_key) {
    throw new Error('Lalamove is not configured')
  }

  const SDKClient = await getLalamoveSDK()
  const environment = tenant.lalamove_sandbox ? 'sandbox' : 'production'
  
  return new SDKClient.ClientModule(
    new SDKClient.Config(
      tenant.lalamove_api_key,
      tenant.lalamove_secret_key,
      environment
    )
  )
}

export async function createLalamoveQuotation(
  tenant: Tenant,
  pickupAddress: string,
  pickupCoordinates: { lat: number; lng: number },
  deliveryAddress: string,
  deliveryCoordinates: { lat: number; lng: number },
  serviceType?: string
) {
  const client = await initLalamoveClient(tenant)
  const market = tenant.lalamove_market || 'HK'
  const service = serviceType || tenant.lalamove_service_type || 'MOTORCYCLE'

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

  const SDKClient = await getLalamoveSDK()
  const language = getLanguageForMarket(market)
  const quotationPayload = SDKClient.QuotationPayloadBuilder.quotationPayload()
    .withLanguage(language)
    .withServiceType(service)
    .withStops([stop1, stop2])
    .build()

  const quotation = await client.Quotation.create(market, quotationPayload)

  return {
    quotationId: quotation.id,
    price: parseFloat(quotation.priceBreakdown.total || '0'),
    currency: quotation.priceBreakdown.currency,
    expiresAt: new Date(quotation.expiresAt),
  }
}

export async function createLalamoveOrder(
  tenant: Tenant,
  quotationId: string,
  senderName: string,
  senderPhone: string,
  recipientName: string,
  recipientPhone: string,
  metadata?: Record<string, unknown>
) {
  const client = await initLalamoveClient(tenant)
  const market = tenant.lalamove_market || 'HK'

  const quotation = await client.Quotation.retrieve(market, quotationId)

  const SDKClient = await getLalamoveSDK()
  const orderPayload = SDKClient.OrderPayloadBuilder.orderPayload()
    .withIsPODEnabled(true)
    .withQuotationID(quotationId)
    .withSender({
      stopId: quotation.stops[0].id || '',
      name: senderName,
      phone: senderPhone,
    })
    .withRecipients([{
      stopId: quotation.stops[1].id || '',
      name: recipientName,
      phone: recipientPhone,
      remarks: '',
    }])
    .withMetadata(metadata || {})
    .build()

  const order = await client.Order.create(market, orderPayload)

  return {
    orderId: order.id,
    status: order.status,
    shareLink: order.shareLink,
    driverId: order.driverId,
  }
}

export async function getLalamoveOrder(tenant: Tenant, orderId: string) {
  const client = await initLalamoveClient(tenant)
  const market = tenant.lalamove_market || 'HK'
  return await client.Order.retrieve(market, orderId)
}

export async function cancelLalamoveOrder(tenant: Tenant, orderId: string) {
  const client = await initLalamoveClient(tenant)
  const market = tenant.lalamove_market || 'HK'
  await client.Order.cancel(market, orderId)
  return true
}
```

## 4. Server Actions (`src/app/actions/lalamove.ts`)

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { 
  createLalamoveQuotation, 
  createLalamoveOrder,
  cancelLalamoveOrder 
} from '@/lib/lalamove-service'
import type { Tenant } from '@/types/database'

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
    const supabase = await createClient()
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (error || !tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    const tenantTyped = tenant as Tenant
    if (!tenantTyped.lalamove_enabled) {
      return { success: false, error: 'Lalamove not enabled' }
    }

    const quotation = await createLalamoveQuotation(
      tenantTyped,
      pickupAddress,
      { lat: pickupLat, lng: pickupLng },
      deliveryAddress,
      { lat: deliveryLat, lng: deliveryLng },
      serviceType
    )

    return { success: true, data: quotation }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create quotation',
    }
  }
}

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
      return { success: false, error: 'Lalamove not enabled' }
    }

    // Check if order already exists
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('lalamove_order_id')
      .eq('id', orderId)
      .single()

    if (existingOrder?.lalamove_order_id) {
      return { success: false, error: 'Lalamove order already exists' }
    }

    // Normalize phone numbers
    function normalizePhone(phone: string | undefined, market: string | undefined): string | undefined {
      if (!phone) return undefined
      const trimmed = String(phone).trim()
      if (trimmed.startsWith('+')) return trimmed
      const digits = trimmed.replace(/\D/g, '')
      if (!digits) return undefined
      const isPH = (market || '').toUpperCase() === 'PH'
      if (isPH) {
        if (digits.startsWith('63')) return `+${digits}`
        if (digits.startsWith('0')) return `+63${digits.slice(1)}`
        return `+63${digits}`
      }
      return `+${digits}`
    }

    const normalizedSenderPhone = normalizePhone(senderPhone, tenantTyped.lalamove_market)
    const normalizedRecipientPhone = normalizePhone(recipientPhone, tenantTyped.lalamove_market)

    const lalamoveOrder = await createLalamoveOrder(
      tenantTyped,
      quotationId,
      senderName,
      normalizedSenderPhone || senderPhone,
      recipientName,
      normalizedRecipientPhone || recipientPhone,
      { ...metadata, orderId, tenantId }
    )

    // Update order in database
    await supabase
      .from('orders')
      .update({
        lalamove_order_id: lalamoveOrder.orderId,
        lalamove_status: lalamoveOrder.status,
        lalamove_tracking_url: lalamoveOrder.shareLink,
      })
      .eq('id', orderId)
      .is('lalamove_order_id', null)

    return { success: true, data: lalamoveOrder }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order',
    }
  }
}

export async function cancelLalamoveOrderAction(
  tenantId: string,
  orderId: string,
  lalamoveOrderId: string
) {
  try {
    const supabase = await createClient()
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (!tenant) {
      return { success: false, error: 'Tenant not found' }
    }

    await cancelLalamoveOrder(tenant as Tenant, lalamoveOrderId)

    await supabase
      .from('orders')
      .update({ lalamove_status: 'CANCELLED' })
      .eq('id', orderId)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel order',
    }
  }
}
```

## 5. Usage Example (Checkout Page)

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createQuotationAction, createLalamoveOrderAction } from '@/app/actions/lalamove'

export function CheckoutPage({ tenant, customerData }) {
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
  const [quotationId, setQuotationId] = useState<string | null>(null)
  const [isFetchingDeliveryFee, setIsFetchingDeliveryFee] = useState(false)

  // Fetch quotation when delivery address changes
  useEffect(() => {
    let isCancelled = false

    const fetchQuote = async () => {
      const deliveryAddress = customerData.delivery_address
      const deliveryLat = customerData.delivery_lat
      const deliveryLng = customerData.delivery_lng

      if (!tenant?.lalamove_enabled || !deliveryAddress || !deliveryLat || !deliveryLng) {
        setDeliveryFee(null)
        setQuotationId(null)
        return
      }

      setIsFetchingDeliveryFee(true)

      try {
        const result = await createQuotationAction(
          tenant.id,
          tenant.restaurant_address!,
          tenant.restaurant_latitude!,
          tenant.restaurant_longitude!,
          deliveryAddress,
          parseFloat(deliveryLat),
          parseFloat(deliveryLng)
        )

        if (isCancelled) return

        if (result.success && result.data) {
          setDeliveryFee(result.data.price)
          setQuotationId(result.data.quotationId)
        }
      } catch (error) {
        console.error('Error fetching quote:', error)
      } finally {
        if (!isCancelled) {
          setIsFetchingDeliveryFee(false)
        }
      }
    }

    fetchQuote()
    return () => { isCancelled = true }
  }, [customerData.delivery_address, customerData.delivery_lat, customerData.delivery_lng])

  // Create order when confirmed
  const handleConfirmOrder = async (orderId: string) => {
    if (quotationId) {
      const result = await createLalamoveOrderAction(
        tenant.id,
        orderId,
        quotationId,
        tenant.name,
        tenant.phone,
        customerData.name,
        customerData.phone
      )

      if (result.success) {
        console.log('Lalamove order created:', result.data)
      }
    }
  }

  return (
    <div>
      {isFetchingDeliveryFee && <p>Calculating delivery fee...</p>}
      {deliveryFee !== null && (
        <p>Delivery Fee: {deliveryFee} {tenant.currency || 'PHP'}</p>
      )}
    </div>
  )
}
```

## 6. Configuration

### Sandbox Mode (Testing)
```typescript
{
  lalamove_enabled: true,
  lalamove_api_key: 'pk_sandbox_xxxxxxxxxxxxx',
  lalamove_secret_key: 'sk_sandbox_xxxxxxxxxxxxx',
  lalamove_market: 'PH',
  lalamove_service_type: 'MOTORCYCLE',
  lalamove_sandbox: true, // ← Sandbox mode
  restaurant_address: '123 Main St',
  restaurant_latitude: 14.5995,
  restaurant_longitude: 120.9842,
}
```

### Production Mode (Live)
```typescript
{
  lalamove_enabled: true,
  lalamove_api_key: 'pk_prod_xxxxxxxxxxxxx',
  lalamove_secret_key: 'sk_prod_xxxxxxxxxxxxx',
  lalamove_market: 'PH',
  lalamove_service_type: 'MOTORCYCLE',
  lalamove_sandbox: false, // ← Production mode
  restaurant_address: '123 Main St',
  restaurant_latitude: 14.5995,
  restaurant_longitude: 120.9842,
}
```

## 7. Supported Markets & Service Types

**Markets**: HK, SG, TH, PH, TW, MY, VN, ID, IN

**Service Types**: MOTORCYCLE, CAR, VAN, TRUCK (varies by market)

## 8. Key Points

- **Quotation Expiry**: Quotations expire in ~5 minutes. Create new one if expired.
- **Phone Format**: Automatically normalized to E.164 format (e.g., `+639123456789`)
- **Sandbox vs Production**: Set `lalamove_sandbox` to match your credentials
- **Market-Specific**: Each market may require separate credentials
- **Error Handling**: Always wrap API calls in try/catch

## 9. Flow Summary

1. **Get Quotation** → Customer enters address → `createQuotationAction()` → Returns price & `quotationId`
2. **Create Order** → Order confirmed → `createLalamoveOrderAction()` → Uses `quotationId` → Returns `orderId` & tracking link
3. **Track Order** → Use `getLalamoveOrder()` to get status updates
4. **Cancel Order** → Use `cancelLalamoveOrderAction()` if needed

---

**Ready to use!** Copy the service and actions files, update your database schema, and configure tenant settings.

