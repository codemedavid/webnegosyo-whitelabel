import * as Haptics from 'expo-haptics'
import type { ReactNode } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
const PRESSED_SCALE = 0.97
const SPRING = { damping: 18, stiffness: 320 }

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** 'light' for taps that change something; 'none' for navigation. */
  haptic?: 'none' | 'light' | 'selection'
  scaleTo?: number
}

/** Every tappable surface: a soft press-in scale, optional haptic, 44pt minimum via hitSlop. */
export function PressableScale({
  children,
  style,
  haptic = 'none',
  scaleTo = PRESSED_SCALE,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={8}
      disabled={disabled}
      {...rest}
      onPressIn={(event) => {
        scale.value = withSpring(scaleTo, SPRING)
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, SPRING)
        onPressOut?.(event)
      }}
      onPress={(event) => {
        if (haptic === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        if (haptic === 'selection') void Haptics.selectionAsync()
        onPress?.(event)
      }}
      style={[animatedStyle, disabled ? { opacity: 0.45 } : null, style]}
    >
      {children}
    </AnimatedPressable>
  )
}
