import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { getOrderByIdRef, updateOrderStatusRef } from '../lib/convex-refs'
import { formatPeso, formatTime } from './OrderCard'
import type { Order, OrderStatus } from '../../../shared/types'

const NEXT_ACTIONS: Record<string, Array<{ status: OrderStatus; label: string }>> = {
  pending: [
    { status: 'confirmed', label: 'Confirm' },
    { status: 'cancelled', label: 'Cancel' },
  ],
  confirmed: [
    { status: 'preparing', label: 'Start Preparing' },
    { status: 'cancelled', label: 'Cancel' },
  ],
  preparing: [{ status: 'ready', label: 'Mark Ready' }],
  ready: [{ status: 'delivered', label: 'Mark Delivered' }],
}

interface OrderDetailProps {
  orderId: string
  tenantName: string
  onClose: () => void
  onToast: (message: string, isError?: boolean) => void
}

export function OrderDetail({
  orderId,
  tenantName,
  onClose,
  onToast,
}: OrderDetailProps): React.JSX.Element {
  const order = useQuery(getOrderByIdRef, { orderId }) as Order | null | undefined
  const updateStatus = useMutation(updateOrderStatusRef)
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState(false)

  const handleStatus = async (status: OrderStatus): Promise<void> => {
    if (!order || busy) return
    if (status === 'cancelled' && !window.confirm('Cancel this order?')) return
    setBusy(true)
    try {
      await updateStatus({ orderId: order._id, status })
      onToast(`Order #${order._id.slice(-6).toUpperCase()} → ${status}`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update status', true)
    } finally {
      setBusy(false)
    }
  }

  const handlePrint = async (): Promise<void> => {
    if (!order || printing) return
    setPrinting(true)
    const result = await window.api.printReceipt({ order, tenantName, copyLabel: 'REPRINT' })
    setPrinting(false)
    onToast(result.ok ? 'Receipt sent to printer' : `Print failed: ${result.error}`, !result.ok)
  }

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h2>{order ? `Order #${order._id.slice(-6).toUpperCase()}` : 'Order'}</h2>
          <button className="btn ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {order === undefined && <div className="center-fill">Loading…</div>}
        {order === null && <div className="center-fill">Order not found.</div>}

        {order && (
          <>
            <div className="detail-body">
              <div className="detail-section">
                <h3>Customer</h3>
                <div className="kv">
                  <span>Name</span>
                  <span>{order.customerName}</span>
                </div>
                <div className="kv">
                  <span>Contact</span>
                  <span>{order.customerContact}</span>
                </div>
                {order.deliveryAddress && (
                  <div className="kv">
                    <span>Address</span>
                    <span>{order.deliveryAddress}</span>
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h3>Details</h3>
                <div className="kv">
                  <span>Status</span>
                  <span>{order.status}</span>
                </div>
                <div className="kv">
                  <span>Placed</span>
                  <span>{formatTime(order._creationTime)}</span>
                </div>
                {order.orderType && (
                  <div className="kv">
                    <span>Type</span>
                    <span>{order.orderType}</span>
                  </div>
                )}
                {order.paymentMethod && (
                  <div className="kv">
                    <span>Payment</span>
                    <span>
                      {order.paymentMethod}
                      {order.paymentStatus ? ` (${order.paymentStatus})` : ''}
                    </span>
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h3>Items</h3>
                {(order.items ?? []).map((item, i) => (
                  <div className="item-row" key={item._id ?? i}>
                    <div className="line">
                      <span>
                        {item.quantity} × {item.menuItemName}
                      </span>
                      <span>{formatPeso(item.subtotal)}</span>
                    </div>
                    {item.variationSelections?.map((sel, j) => (
                      <div className="sub" key={j}>
                        {sel.typeName}: {sel.optionName}
                      </div>
                    ))}
                    {!item.variationSelections?.length && item.variation && (
                      <div className="sub">{item.variation}</div>
                    )}
                    {item.addons?.map((addon, j) => (
                      <div className="sub" key={j}>
                        + {addon.quantity && addon.quantity > 1 ? `${addon.quantity} × ` : ''}
                        {addon.name} ({formatPeso(addon.price)})
                      </div>
                    ))}
                    {item.specialInstructions && (
                      <div className="sub">“{item.specialInstructions}”</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="detail-foot">
              <div className="total-row">
                <span>Total</span>
                <span>{formatPeso(order.total)}</span>
              </div>
              <div className="status-buttons">
                {(NEXT_ACTIONS[order.status] ?? []).map((action) => (
                  <button
                    key={action.status}
                    className={`btn ${action.status === 'cancelled' ? 'danger' : 'primary'}`}
                    disabled={busy}
                    onClick={() => void handleStatus(action.status)}
                  >
                    {action.label}
                  </button>
                ))}
                <button className="btn" disabled={printing} onClick={() => void handlePrint()}>
                  {printing ? 'Printing…' : '🖨 Print Receipt'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
