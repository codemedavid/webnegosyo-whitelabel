import { create } from 'zustand'

// Drives the offline/sync status pill in the UI. The sync engine is the only
// writer; components read it to show pending count and connection state.
interface SyncState {
  isOnline: boolean
  pendingCount: number
  isSyncing: boolean
  lastSyncedAt: number | null
  lastError: string | null
  setOnline: (v: boolean) => void
  setPendingCount: (n: number) => void
  setSyncing: (v: boolean) => void
  setLastSynced: (t: number) => void
  setLastError: (e: string | null) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  // Seed from the browser's connectivity guess so the first paint is accurate.
  isOnline: navigator.onLine,
  pendingCount: 0,
  isSyncing: false,
  lastSyncedAt: null,
  lastError: null,

  setOnline: (v) => set({ isOnline: v }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setSyncing: (v) => set({ isSyncing: v }),
  setLastSynced: (t) => set({ lastSyncedAt: t }),
  setLastError: (e) => set({ lastError: e }),
}))
