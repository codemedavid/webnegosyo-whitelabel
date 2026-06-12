import type { Order } from '../../../shared/types'

interface OrderCardProps {
  order: Order
  isSelected: boolean
  onClick: () => void
}

export function formatPeso(value: number): string {
  return `₱${value.toFixed(2)}`
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

export function OrderCard({ order, isSelected, onClick }: OrderCardProps): React.JSX.Element {
  return (
    <div className={`order-card${isSelected ? ' selected' : ''}`} onClick={onClick}>
      <div className="top">
        <span>#{order._id.slice(-6).toUpperCase()}</span>
        <span>{formatPeso(order.total)}</span>
      </div>
      <div className="meta">
        <span>{order.customerName}</span>
        <span>{formatTime(order._creationTime)}</span>
      </div>
      <div className="meta">
        <span>
          {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
        </span>
        <span>{order.orderType ?? order.source}</span>
      </div>
    </div>
  )
}
