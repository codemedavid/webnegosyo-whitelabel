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
