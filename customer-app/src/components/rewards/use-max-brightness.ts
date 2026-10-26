import * as Brightness from 'expo-brightness'
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { Platform } from 'react-native'

const FULL = 1

/**
 * Full screen brightness while the member QR is on screen, so a counter
 * scanner reads it first time; the customer's own level comes back on blur.
 * Brightness is a nicety — a refusal (simulator, OS policy) leaves the screen as it was.
 */
export function useMaxBrightness(isActive: boolean) {
  useFocusEffect(
    useCallback(() => {
      if (!isActive) return undefined
      let previous: number | null = null
      let isFocused = true
      const raise = async () => {
        if (!(await Brightness.isAvailableAsync())) return
        previous = await Brightness.getBrightnessAsync()
        if (isFocused) await Brightness.setBrightnessAsync(FULL)
      }
      raise().catch(() => undefined)
      return () => {
        isFocused = false
        const restore =
          Platform.OS === 'android'
            ? Brightness.restoreSystemBrightnessAsync()
            : previous !== null
              ? Brightness.setBrightnessAsync(previous)
              : Promise.resolve()
        restore.catch(() => undefined)
      }
    }, [isActive]),
  )
}
