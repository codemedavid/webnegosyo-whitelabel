import { create } from 'zustand'
import type { CartItem } from '@/types/database'

export interface CompletedOrderData {
  items: CartItem[]
  total: number
  customerData: Record<string, string>
  formFields: { field_name: string; field_label: string }[]
  isCustomerHistoryTracked: boolean
  previousOrderCount: number
  totalOrderCount: number
  orderTypeName: string | null
  paymentMethodName: string | null
  paymentMethodDetails: string | null
  messengerMessage: string
  messengerUrl: string
  orderId: string | null
  /** Per-tenant, daily-resetting display number; null when unknown (Convex path). */
  dailyNumber?: number | null
  /** Human label for an advance/scheduled order, e.g. "Tue, Jun 18 · 5:00 PM"; null = ASAP. */
  scheduledForLabel?: string | null
}

interface OrderStore {
  completedOrder: CompletedOrderData | null
  setCompletedOrder: (data: CompletedOrderData) => void
  clearCompletedOrder: () => void
}

export const useOrderStore = create<OrderStore>((set) => ({
  completedOrder: null,
  setCompletedOrder: (data) => set({ completedOrder: data }),
  clearCompletedOrder: () => set({ completedOrder: null }),
}))
