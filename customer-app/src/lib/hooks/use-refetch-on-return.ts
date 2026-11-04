import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'

/**
 * Re-reads when the customer comes back: to this screen (not its first
 * mount, which already loads) or to the app while this screen is on top.
 */
export function useRefetchOnReturn(refetch: () => unknown, isEnabled: boolean): void {
  const latest = useRef({ refetch, isEnabled })
  const hasFocusedOnce = useRef(false)
  useEffect(() => {
    latest.current = { refetch, isEnabled }
  }, [refetch, isEnabled])

  useFocusEffect(
    useCallback(() => {
      const reread = () => {
        if (latest.current.isEnabled) void latest.current.refetch()
      }
      if (hasFocusedOnce.current) reread()
      hasFocusedOnce.current = true
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') reread()
      })
      return () => subscription.remove()
    }, []),
  )
}
