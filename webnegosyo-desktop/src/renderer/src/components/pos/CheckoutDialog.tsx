import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { createOrderRef, updatePaymentStatusRef } from '../../lib/convex-refs'
import { fetchOrderTypes, fetchPaymentMethods } from '../../lib/supabase-queries'
import type { OrderType, PaymentMethod } from '../../lib/menu-types'
import { useAuthStore } from '../../stores/auth-store'
import { useCartStore, type CartLine } from '../../stores/cart-store'
import { formatPeso } from '../OrderCard'
import type { Order, OrderItem } from '../../../../shared/types'

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
  const createOrder = useMutation(createOrderRef)
  const updatePaymentStatus = useMutation(updatePaymentStatusRef)

  const [orderTypes, setOrderTypes] = useState<OrderType[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [orderTypeId, setOrderTypeId] = useState<string>('')
  const [paymentMethodId, setPaymentMethodId] = useState<string>('')
  const [customerName, setCustomerName] = useState('Walk-in')
  const [customerContact, setCustomerContact] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Load order types once.
  useEffect(() => {
    if (!tenantId) return
    void fetchOrderTypes(tenantId)
      .then((types) => {
        setOrderTypes(types)
        if (types.length > 0) setOrderTypeId(types[0].id)
      })
      .catch((err) => onToast(err instanceof Error ? err.message : 'Failed to load order types', true))
  }, [tenantId, onToast])

  // Load payment methods whenever the order type changes.
  useEffect(() => {
    if (!tenantId) return
    void fetchPaymentMethods(tenantId, orderTypeId || undefined)
      .then((methods) => {
        setPaymentMethods(methods)
        setPaymentMethodId((prev) =>
          methods.some((m) => m.id === prev) ? prev : (methods[0]?.id ?? '')
        )
      })
      .catch(() => setPaymentMethods([]))
  }, [tenantId, orderTypeId])

  const cartTotal = total()
  const selectedOrderType = orderTypes.find((t) => t.id === orderTypeId)
  const selectedPayment = paymentMethods.find((m) => m.id === paymentMethodId)

  const handleConfirm = async (): Promise<void> => {
    if (submitting || lines.length === 0) return
    setSubmitting(true)
    try {
      const built = lines.map(buildItem)
      const clientOrderId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `pos_${Date.now()}_${Math.round(Math.random() * 1e6)}`

      const orderId = (await createOrder({
        customerName: customerName.trim() || 'Walk-in',
        customerContact: customerContact.trim() || 'POS',
        customerData: { name: customerName.trim() || 'Walk-in', source: 'pos' },
        total: cartTotal,
        orderType: selectedOrderType?.name,
        orderTypeId: selectedOrderType ? String(selectedOrderType.id) : undefined,
        source: 'pos',
        clientOrderId,
        itemCount: itemCount(),
        paymentMethod: selectedPayment?.name ?? 'Cash',
        paymentMethodDetails: selectedPayment?.details,
        items: built.map((b) => b.payload),
      })) as string

      // Counter sales are paid on the spot.
      try {
        await updatePaymentStatus({ orderId, paymentStatus: 'paid' })
      } catch {
        // Non-fatal: order is created; payment status can be reconciled later.
      }

      // Print immediately from a locally-built order (no Convex round-trip).
      const order: Order = {
        _id: orderId,
        _creationTime: Date.now(),
        customerName: customerName.trim() || 'Walk-in',
        customerContact: customerContact.trim() || 'POS',
        status: 'confirmed',
        orderType: selectedOrderType?.name,
        source: 'pos',
        total: cartTotal,
        itemCount: itemCount(),
        paymentMethod: selectedPayment?.name ?? 'Cash',
        paymentMethodDetails: selectedPayment?.details,
        paymentStatus: 'paid',
        items: built.map((b) => b.receipt),
      }
      const result = await window.api.printReceipt({ order, tenantName: tenantName ?? 'Receipt' })
      if (!result.ok) onToast(`Order saved, but print failed: ${result.error}`, true)

      clear()
      onToast(`Sale complete · ${formatPeso(cartTotal)}`)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete sale'
      onToast(message, true)
    } finally {
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
