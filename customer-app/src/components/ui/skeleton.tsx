import { useEffect } from 'react'
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useTokens } from '@/theme/theme-context'

const PULSE_MS = 900

interface SkeletonProps {
  width?: DimensionValue
  height: number
  radius?: number
  style?: StyleProp<ViewStyle>
}

/** Content-shaped loading placeholder. Screens use these, never a centred spinner. */
export function Skeleton({ width = '100%', height, radius, style }: SkeletonProps) {
  const tokens = useTokens()
  const opacity = useSharedValue(0.55)
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [opacity])
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius ?? tokens.radius.md, backgroundColor: tokens.colors.surfaceMuted },
        animatedStyle,
        style,
      ]}
    />
  )
}
