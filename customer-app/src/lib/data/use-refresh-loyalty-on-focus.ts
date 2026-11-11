import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { AppState } from 'react-native'
import { useSession } from '@/lib/stores/session'
import { refreshLoyalty } from './hooks'

/**
 * Stamps land at the counter, so a tab showing the card (Home, Scan, Rewards)
 * re-reads it every time it comes into view, and when the app comes back to
 * the front while it is on top. One call per screen.
 */
export function useRefreshLoyaltyOnFocus(): void {
  const isMember = useSession((state) => state.status === 'member')
  useFocusEffect(
    useCallback(() => {
      if (!isMember) return undefined
      void refreshLoyalty()
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refreshLoyalty()
      })
      return () => subscription.remove()
    }, [isMember]),
  )
}
