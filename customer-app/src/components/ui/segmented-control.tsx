import { useState } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { useTokens } from '@/theme/theme-context'
import { AppText } from './app-text'
import { PressableScale } from './pressable-scale'

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  accessibilityLabel: string
}

const PAD = 4

/** Pill segmented control with a sliding thumb (Pickup / Delivery / Dine in). */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  const { colors, radius, elevation } = useTokens()
  const [width, setWidth] = useState(0)
  const segmentWidth = options.length > 0 ? (width - PAD * 2) / options.length : 0
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(selectedIndex * segmentWidth, { damping: 20, stiffness: 260 }) }],
  }))
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', padding: PAD, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: PAD,
              bottom: PAD,
              left: PAD,
              width: segmentWidth,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              ...elevation.card,
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <PressableScale
            key={option.value}
            haptic="selection"
            scaleTo={0.98}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(option.value)}
            style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <AppText variant={isSelected ? 'bodyStrong' : 'callout'} color={isSelected ? 'text' : 'textMuted'}>
              {option.label}
            </AppText>
          </PressableScale>
        )
      })}
    </View>
  )
}
