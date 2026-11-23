'use client'

import { toast } from 'sonner'
import { getReceiptContext } from '@/app/actions/receipt'
import { buildAdminReceiptSegments, openReceiptPrintWindow } from '@/lib/receipt-web'
import type { OrderWithItems } from '@/lib/orders-service'

/**
 * Browser print of the same block layout the thermal printer uses. The store's
 * layout, name and tax identity (`context?.tax`) are fetched on click, so the
 * published layout prints, not a page-load snapshot.
 */
export async function printOrderReceipt(order: OrderWithItems, tenantId: string, tenantSlug: string): Promise<void> {
  try {
    const context = await getReceiptContext(tenantId)
    const segments = buildAdminReceiptSegments(order, context?.storeName ?? tenantSlug, context?.receiptLayout ?? null, context?.tax ?? null)
    if (!openReceiptPrintWindow(segments)) toast.error('Allow pop-ups to print the receipt')
  } catch {
    toast.error('Could not prepare the receipt')
  }
}
