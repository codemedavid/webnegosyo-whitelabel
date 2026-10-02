import { Check } from 'lucide-react-native'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import type { TrackingStep } from '@/lib/orders/steps'
import { useTokens } from '@/theme/theme-context'
import { AppText } from './app-text'

const DOT = 26
const PULSE_MS = 1100

function PulsingDot({ color }: { color: string }) {
  const scale = useSharedValue(1)
  useEffect(() => {
    scale.value = withRepeat(withTiming(1.6, { duration: PULSE_MS }), -1, false)
  }, [scale])
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: 1.6 - scale.value }))
  return (
    <View style={{ width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color }, halo]} />
      <View style={{ width: DOT * 0.55, height: DOT * 0.55, borderRadius: DOT, backgroundColor: color }} />
    </View>
  )
}

/** Vertical order progress: done steps checked, the live one pulsing. */
export function StepTracker({ steps }: { steps: TrackingStep[] }) {
  const { colors, space } = useTokens()
  return (
    <View accessibilityRole="progressbar">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1
        const tone = step.state === 'upcoming' ? colors.border : step.key === 'cancelled' ? colors.danger : colors.primary
        return (
          <View key={step.key} style={{ flexDirection: 'row', gap: space.md, minHeight: 52 }}>
            <View style={{ alignItems: 'center', width: DOT }}>
              {step.state === 'current' ? (
                <PulsingDot color={tone} />
              ) : (
                <View
                  style={{
                    width: DOT,
                    height: DOT,
                    borderRadius: DOT / 2,
                    backgroundColor: step.state === 'done' ? tone : colors.surface,
                    borderWidth: 2,
                    borderColor: tone,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {step.state === 'done' ? <Check size={14} color={colors.onPrimary} strokeWidth={3} /> : null}
                </View>
              )}
              {!isLast ? (
                <View style={{ flex: 1, width: 2, marginVertical: 2, backgroundColor: step.state === 'done' ? tone : colors.border }} />
              ) : null}
            </View>
            <AppText
              variant={step.state === 'current' ? 'headline' : 'body'}
              color={step.state === 'upcoming' ? 'textMuted' : 'text'}
              style={{ paddingTop: 3 }}
            >
              {step.label}
            </AppText>
          </View>
        )
      })}
    </View>
  )
}
