import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from 'convex/react'
import { getRealtimeQueueRef } from '../lib/convex-refs'
import { useAuthStore } from '../stores/auth-store'
import { useAutoPrint } from '../hooks/useAutoPrint'
import { playNewOrderChime } from '../lib/chime'
import { OrderCard } from '../components/OrderCard'
import { OrderDetail } from '../components/OrderDetail'
import { SettingsDialog } from '../components/SettingsDialog'
import { PosScreen } from './PosScreen'
import type { AppSettings, Order } from '../../../shared/types'

type Queue = Record<'pending' | 'confirmed' | 'preparing' | 'ready', Order[]>

const COLUMNS: Array<{ key: keyof Queue; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
]

interface Toast {
  id: number
  message: string
  isError: boolean
}

export function OrdersScreen(): React.JSX.Element {
  const { tenantName, logout } = useAuthStore()
  const queue = useQuery(getRealtimeQueueRef, {}) as Queue | undefined
  const [tab, setTab] = useState<'orders' | 'pos'>('orders')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const seenPendingIds = useRef<Set<string> | null>(null)

  useEffect(() => {
    void window.api.getSettings().then(setSettings)
  }, [])

  const pushToast = useCallback((message: string, isError = false) => {
    const id = ++toastId.current
    setToasts((prev) => [...prev, { id, message, isError }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])

  // Chime on new pending orders (skip the initial snapshot)
  useEffect(() => {
    if (!queue?.pending) return
    const ids = new Set(queue.pending.map((o) => o._id))
    if (seenPendingIds.current) {
      const hasNew = queue.pending.some((o) => !seenPendingIds.current!.has(o._id))
      if (hasNew) {
        playNewOrderChime()
        pushToast('New order received!')
      }
    }
    seenPendingIds.current = ids
  }, [queue?.pending, pushToast])

  const handlePrinted = useCallback(
    (order: Order, ok: boolean, error?: string) => {
      const orderNo = order._id.slice(-6).toUpperCase()
      pushToast(
        ok ? `Receipt printed for order #${orderNo}` : `Auto-print failed for #${orderNo}: ${error}`,
        !ok
      )
    },
    [pushToast]
  )

  useAutoPrint(
    queue?.pending,
    tenantName ?? 'Receipt',
    settings?.autoPrintEnabled ?? false,
    handlePrinted
  )

  return (
    <>
      <div className="topbar">
        <span className="store">{tenantName}</span>
        <span className="live-dot" />
        <span className="live-label">Live</span>
        <div className="tab-switch">
          <button
            className={`tab${tab === 'orders' ? ' active' : ''}`}
            onClick={() => setTab('orders')}
          >
            Orders
          </button>
          <button className={`tab${tab === 'pos' ? ' active' : ''}`} onClick={() => setTab('pos')}>
            POS
          </button>
        </div>
        <span className="spacer" />
        <span className={`autoprint-badge${settings?.autoPrintEnabled ? ' on' : ''}`}>
          🖨 Auto-print {settings?.autoPrintEnabled ? 'ON' : 'OFF'}
        </span>
        <button className="btn" onClick={() => setShowSettings(true)}>
          Settings
        </button>
        <button className="btn ghost" onClick={() => void logout()}>
          Sign out
        </button>
      </div>

      {tab === 'pos' && <PosScreen onToast={pushToast} />}

      {tab === 'orders' && (
      <div className="board">
        {COLUMNS.map((col) => {
          const orders = queue?.[col.key] ?? []
          return (
            <div className={`column ${col.key}`} key={col.key}>
              <div className="column-head">
                <span>{col.label}</span>
                <span className="count">{orders.length}</span>
              </div>
              <div className="column-body">
                {queue === undefined && <span className="live-label">Loading…</span>}
                {queue !== undefined && orders.length === 0 && (
                  <span className="live-label">No orders</span>
                )}
                {orders.map((order) => (
                  <OrderCard
                    key={order._id}
                    order={order}
                    isSelected={selectedOrderId === order._id}
                    onClick={() => setSelectedOrderId(order._id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      )}

      {tab === 'orders' && selectedOrderId && (
        <OrderDetail
          orderId={selectedOrderId}
          tenantName={tenantName ?? 'Receipt'}
          onClose={() => setSelectedOrderId(null)}
          onToast={pushToast}
        />
      )}

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} onSaved={setSettings} />
      )}

      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.isError ? ' error' : ''}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </>
  )
}
