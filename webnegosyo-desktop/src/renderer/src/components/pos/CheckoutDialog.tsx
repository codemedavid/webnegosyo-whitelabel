import { useEffect, useState } from 'react'
import { getCachedCatalog, refreshCatalog } from '../../lib/catalog-cache'
import { requestSync } from '../../lib/sync-engine'
import type { OrderType, PaymentMethod } from '../../lib/menu-types'
import { useAuthStore } from '../../stores/auth-store'
import { useSyncStore } from '../../stores/sync-store'
import { useCartStore, type CartLine } from '../../stores/cart-store'
import { formatPeso } from '../OrderCard'
import type { Order, OrderItem, PosOrderPayload } from '../../../../shared/types'

interface CheckoutDialogProps {
  onClose: () => void
  onToast: (message: string, isError?: boolean) => void
}

interface BuiltItem {
  payload: {
    menuItemId: string
    menuItemName: string
    quantity: number
    price: number
    subtotal: number
    specialInstructions?: string
    variation?: string
    variationSelections?: Array<{ typeName: string; optionName: string; priceAdjustment: number }>
    addons?: Array<{ name: string; price: number }>
  }
  receipt: OrderItem
}

function buildItem(line: CartLine): BuiltItem {
  const variationSelections = Object.entries(line.selectedVariations).map(([typeId, opt]) => {
    const type = (line.item.variation_types ?? []).find((t) => t.id === typeId)
    return {
      typeName: type?.name ?? 'Variation',
      optionName: opt.name,
      priceAdjustment: opt.price_modifier ?? 0,
    }
  })

  const variationString =
    variationSelections.length > 0
      ? variationSelections.map((v) => v.optionName).join(', ')
      : line.selectedVariation?.name

  const addons = line.selectedAddons.map((a) => ({ name: a.name, price: a.price ?? 0 }))
  const basePrice = line.item.discounted_price ?? line.item.price

  return {
    payload: {
      menuItemId: String(line.item.id),
      menuItemName: line.item.name,
      quantity: line.quantity,
      price: basePrice,
      subtotal: line.subtotal,
      specialInstructions: line.specialInstructions,
      variation: variationString,
      variationSelections: variationSelections.length > 0 ? variationSelections : undefined,
      addons: addons.length > 0 ? addons : undefined,
    },
    receipt: {
      menuItemName: line.item.name,
      quantity: line.quantity,
      price: basePrice,
      subtotal: line.subtotal,
      variation: variationString,
      variationSelections: variationSelections.length > 0 ? variationSelections : undefined,
      addons: addons.length > 0 ? addons : undefined,
      specialInstructions: line.specialInstructions,
    },
  }
}

export function CheckoutDialog({ onClose, onToast }: CheckoutDialogProps): React.JSX.Element {
  const { tenantId, tenantName } = useAuthStore()
  const { lines, total, itemCount, clear } = useCartStore()

  const [orderTypes, setOrderTypes] = useState<OrderType[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [orderTypeId, setOrderTypeId] = useState<string>('')
  const [paymentMethodId, setPaymentMethodId] = useState<string>('')
  const [customerName, setCustomerName] = useState('Walk-in')
  const [customerContact, setCustomerContact] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // The cached catalog holds both order types and the per-type payment methods,
  // so checkout never touches the network. We hold the whole snapshot in state
  // and derive payment methods from it as the selected order type changes.
  const [catalogPaymentMethods, setCatalogPaymentMethods] = useState<
    Record<string, unknown[]>
  >({})

  // Load order types + payment methods from the offline cache on mount, then
  // refresh from Supabase in the background so they stay fresh when online.
  useEffect(() => {
    if (!tenantId) return
    let active = true

    const apply = (cache: { orderTypes: unknown[]; paymentMethods: Record<string, unknown[]> }): void => {
      if (!active) return
      const types = cache.orderTypes as OrderType[]
      setOrderTypes(types)
      setCatalogPaymentMethods(cache.paymentMethods)
      // Default to the first order type only if none is selected yet.
      setOrderTypeId((prev) => (prev ? prev : (types[0]?.id ?? '')))
    }

    void getCachedCatalog(tenantId).then((cache) => {
      if (cache) apply(cache)
    })
    // Background refresh — ignore failures (offline keeps the cached copy).
    void refreshCatalog(tenantId)
      .then((cache) => apply(cache))
      .catch(() => {})

    return () => {
      active = false
    }
  }, [tenantId])

  // Derive payment methods from the cached catalog for the selected order type,
  // falling back to the unfiltered set (''); keep the prior selection if present.
  useEffect(() => {
    const pm = (catalogPaymentMethods[orderTypeId] ??
      catalogPaymentMethods[''] ??
      []) as PaymentMethod[]
    setPaymentMethods(pm)
    setPaymentMethodId((prev) => (pm.some((m) => m.id === prev) ? prev : (pm[0]?.id ?? '')))
  }, [catalogPaymentMethods, orderTypeId])

  const cartTotal = total()
  const selectedOrderType = orderTypes.find((t) => t.id === orderTypeId)
  const selectedPayment = paymentMethods.find((m) => m.id === paymentMethodId)

  const handleConfirm = async (): Promise<void> => {
    if (submitting || lines.length === 0) return
    setSubmitting(true)

    // Snapshot everything we need up front so background work (payment status,
    // printing) is unaffected by clearing the cart / unmounting the dialog.
    const built = lines.map(buildItem)
    const trimmedName = customerName.trim() || 'Walk-in'
    const trimmedContact = customerContact.trim() || 'POS'
    const orderTypeName = selectedOrderType?.name
    const paymentName = selectedPayment?.name ?? 'Cash'
    const paymentDetails = selectedPayment?.details
    const lineCount = itemCount()
    const clientOrderId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `pos_${Date.now()}_${Math.round(Math.random() * 1e6)}`

    // Critical path: persist the sale to the durable LOCAL store first. This is
    // instant and offline-safe — the cashier is never blocked on the network.
    // The background sync engine (mounted in App via useSyncEngine) replays it
    // to Convex when a connection is available; createOrder is idempotent on
    // clientOrderId, so re-syncing can never create duplicates.
    const payload: PosOrderPayload = {
      customerName: trimmedName,
      customerContact: trimmedContact,
      customerData: { name: trimmedName, source: 'pos' },
      total: cartTotal,
      orderType: orderTypeName,
      orderTypeId: selectedOrderType ? String(selectedOrderType.id) : undefined,
      source: 'pos',
      clientOrderId,
      itemCount: lineCount,
      paymentMethod: paymentName,
      paymentMethodDetails: paymentDetails,
      items: built.map((b) => b.payload),
    }

    try {
      // Durable write — once this resolves the sale is recorded and survives a
      // crash or restart. Counter sales are paid on the spot.
      await window.api.savePosOrder(payload, 'paid')

      // Hand the counter back to the cashier right away.
      clear()
      onToast(`Sale complete · ${formatPeso(cartTotal)}`)
      onClose()

      // Reflect the new sale in the pending-sync badge immediately — even
      // offline, where requestSync() no-ops, so the count would otherwise look
      // stale precisely in the scenario the badge exists for.
      void window.api
        .getPosPendingCount()
        .then((c) => useSyncStore.getState().setPendingCount(c))
        .catch(() => {})

      // Nudge the sync engine to drain immediately if we happen to be online.
      requestSync()

      // Background: print from a locally-built order (no Convex round-trip). The
      // clientOrderId stands in as the order id until the sync assigns the real one.
      const order: Order = {
        _id: clientOrderId,
        _creationTime: Date.now(),
        customerName: trimmedName,
        customerContact: trimmedContact,
        status: 'confirmed',
        orderType: orderTypeName,
        source: 'pos',
        total: cartTotal,
        itemCount: lineCount,
        paymentMethod: paymentName,
        paymentMethodDetails: paymentDetails,
        paymentStatus: 'paid',
        items: built.map((b) => b.receipt),
      }
      void window.api
        .printReceipt({ order, tenantName: tenantName ?? 'Receipt' })
        .then((result) => {
          if (!result.ok) onToast(`Sale saved, but print failed: ${result.error}`, true)
        })
        .catch((err) =>
          onToast(`Sale saved, but print failed: ${err instanceof Error ? err.message : err}`, true)
        )
    } catch {
      // Only a rare LOCAL DISK failure lands here; the dialog is still open.
      onToast('Failed to save sale locally. Please try again.', true)
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Charge {formatPeso(cartTotal)}</h2>

        <div className="field">
          <label>Customer name</label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Walk-in"
          />
        </div>

        <div className="field">
          <label>Contact (optional)</label>
          <input
            type="text"
            value={customerContact}
            onChange={(e) => setCustomerContact(e.target.value)}
            placeholder="Phone / name"
          />
        </div>

        {orderTypes.length > 0 && (
          <div className="field">
            <label>Order type</label>
            <select value={orderTypeId} onChange={(e) => setOrderTypeId(e.target.value)}>
              {orderTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>Payment method</label>
          {paymentMethods.length > 0 ? (
            <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" value="Cash" disabled />
          )}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void handleConfirm()} disabled={submitting}>
            {submitting ? 'Processing…' : `Charge & Print · ${formatPeso(cartTotal)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
