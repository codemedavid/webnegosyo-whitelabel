import {
  renderReceipt,
  resolveReceiptLayout,
  type ReceiptOrder,
} from '@/lib/receipt-layout'
import type { OrderWithItems } from '@/lib/orders-service'

/**
 * Web-admin receipt rendering: maps the admin's order shape into the shared
 * block engine so "Print receipt" in the browser produces the same layout the
 * thermal printer does. Browsers cannot reach a BLE printer — this path
 * prints paper/PDF through the OS print dialog.
 */

export function mapSupabaseOrderToReceipt(order: OrderWithItems): ReceiptOrder {
  return {
    _id: order.id,
    _creationTime: Date.parse(order.created_at),
    customerName: order.customer_name ?? 'Customer',
    customerContact: order.customer_contact ?? '',
    orderType: order.order_type ?? undefined,
    total: order.total,
    deliveryFee: order.delivery_fee ?? undefined,
    // Populated by web checkout since order types gained a service-charge rate,
    // and already read by the order detail dialog. Dropping it here printed a
    // browser receipt whose items did not add up to its own total.
    serviceCharge: order.service_charge_amount ?? undefined,
    paymentMethod: order.payment_method_name ?? undefined,
    customerData: order.customer_data,
    items: (order.order_items ?? []).map((item) => ({
      menuItemName: item.menu_item_name,
      quantity: item.quantity,
      subtotal: item.subtotal,
      ...(item.variation ? { variation: item.variation } : {}),
      // Admin rows store addon names only; the engine prints names, so a zero
      // price placeholder is enough.
      ...(item.addons && item.addons.length > 0
        ? { addons: item.addons.map((name) => ({ name, price: 0 })) }
        : {}),
      ...(item.special_instructions
        ? { specialInstructions: item.special_instructions }
        : {}),
    })),
  }
}

/** Render the printable text for an admin order under the tenant's layout. */
export function buildAdminReceiptText(
  order: OrderWithItems,
  storeName: string,
  savedLayout: unknown,
): string {
  return renderReceipt(
    mapSupabaseOrderToReceipt(order),
    { storeName },
    resolveReceiptLayout(savedLayout),
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Open the browser print dialog with the receipt in a monospace paper-roll
 * column. Client-side only.
 */
export function openReceiptPrintWindow(receiptText: string): boolean {
  const printWindow = window.open('', '_blank', 'width=420,height=640')
  if (!printWindow) return false

  printWindow.document.write(
    '<!doctype html><html><head><title>Receipt</title><style>' +
      'body{margin:0;padding:16px;display:flex;justify-content:center}' +
      'pre{font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;white-space:pre;margin:0}' +
      '</style></head><body><pre>' +
      escapeHtml(receiptText) +
      '</pre></body></html>',
  )
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return true
}
