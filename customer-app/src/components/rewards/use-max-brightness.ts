import * as Brightness from 'expo-brightness'
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { AppState, Platform } from 'react-native'

const FULL = 1

/**
 * Full screen brightness while the member QR is on screen, so a counter
 * scanner reads it first time; the customer's own level comes back on blur
 * AND when the app goes to the background (iOS would otherwise keep the next
 * app at full brightness), and goes up again when they come back to the QR.
 * Brightness is a nicety — a refusal (simulator, OS policy) leaves the screen as it was.
 */
export function useMaxBrightness(isActive: boolean) {
  useFocusEffect(
    useCallback(() => {
      if (!isActive) return undefined
      let previous: number | null = null
      let isRaised = false
      let isFocused = true

      const raise = async () => {
        if (isRaised || !(await Brightness.isAvailableAsync())) return
        previous = await Brightness.getBrightnessAsync()
        if (!isFocused) return
        await Brightness.setBrightnessAsync(FULL)
        isRaised = true
      }
      const restore = async () => {
        if (!isRaised) return
        isRaised = false
        if (Platform.OS === 'android') await Brightness.restoreSystemBrightnessAsync()
        else if (previous !== null) await Brightness.setBrightnessAsync(previous)
      }

      raise().catch(() => undefined)
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') raise().catch(() => undefined)
        else if (state === 'background') restore().catch(() => undefined)
      })
      return () => {
        isFocused = false
        subscription.remove()
        restore().catch(() => undefined)
      }
    }, [isActive]),
  )
}
