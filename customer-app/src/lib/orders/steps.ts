import type { AppOrderKind, AppOrderStatus } from '@/lib/contract'

export type StepState = 'done' | 'current' | 'upcoming'

export interface TrackingStep {
  key: string
  label: string
  state: StepState
}

const FLOW: readonly Exclude<AppOrderStatus, 'cancelled'>[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivered']

function labelsFor(kind: AppOrderKind): Record<(typeof FLOW)[number], string> {
  const base = { pending: 'Order placed', confirmed: 'Confirmed', preparing: 'Preparing' }
  if (kind === 'delivery') return { ...base, ready: 'On the way', delivered: 'Delivered' }
  if (kind === 'dine_in') return { ...base, ready: 'Ready to serve', delivered: 'Served' }
  return { ...base, ready: 'Ready for pickup', delivered: 'Picked up' }
}

/** The tracker's steps. `delivered` is the platform's terminal "completed" for every kind. */
export function trackingSteps(status: AppOrderStatus, kind: AppOrderKind): TrackingStep[] {
  if (status === 'cancelled') return [{ key: 'cancelled', label: 'Order cancelled', state: 'current' }]
  const labels = labelsFor(kind)
  const currentIndex = FLOW.indexOf(status)
  const isComplete = status === 'delivered'
  return FLOW.map((key, index) => ({
    key,
    label: labels[key],
    state: index < currentIndex || isComplete ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }))
}
