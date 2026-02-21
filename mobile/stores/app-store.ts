import { create } from 'zustand'
import type { Tenant } from '@/types/database'

interface AppState {
  tenant: Tenant | null
  isReady: boolean
  setTenant: (tenant: Tenant) => void
  setReady: (ready: boolean) => void
}

export const useAppStore = create<AppState>()((set) => ({
  tenant: null,
  isReady: false,
  setTenant: (tenant) => set({ tenant }),
  setReady: (ready) => set({ isReady: ready }),
}))
