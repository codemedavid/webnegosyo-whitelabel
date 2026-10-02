import type { BottomTabBarProps } from 'expo-router/tabs'
import { CircleUser, Gift, House, QrCode, UtensilsCrossed, type LucideIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { useTokens } from '@/theme/theme-context'
import { FloatingCartBar } from './floating-cart-bar'

const TABS: Record<string, { label: string; Icon: LucideIcon }> = {
  index: { label: 'Home', Icon: House },
  order: { label: 'Order', Icon: UtensilsCrossed },
  scan: { label: 'Scan', Icon: QrCode },
  rewards: { label: 'Rewards', Icon: Gift },
  account: { label: 'Account', Icon: CircleUser },
}

const SCAN_BUTTON = 60

/** Five tabs with a raised centre Scan — the member QR is always one tap away. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, space, elevation } = useTokens()
  const insets = useSafeAreaInsets()
  const activeRoute = state.routes[state.index]?.name
  return (
    <View pointerEvents="box-none">
      {activeRoute !== 'scan' ? <FloatingCartBar /> : null}
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          paddingBottom: Math.max(insets.bottom, space.sm),
          paddingTop: space.sm,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        {state.routes.map((route, index) => {
          const tab = TABS[route.name]
          if (!tab) return null
          const isFocused = state.index === index
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name)
          }
          if (route.name === 'scan')
            return (
              <View key={route.key} style={{ flex: 1, alignItems: 'center' }}>
                <PressableScale
                  haptic="light"
                  onPress={onPress}
                  accessibilityRole="tab"
                  accessibilityLabel="Scan member QR"
                  accessibilityState={{ selected: isFocused }}
                  style={{
                    width: SCAN_BUTTON,
                    height: SCAN_BUTTON,
                    marginTop: -SCAN_BUTTON / 2,
                    borderRadius: SCAN_BUTTON / 2,
                    backgroundColor: colors.primary,
                    borderWidth: 4,
                    borderColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...elevation.raised,
                  }}
                >
                  <tab.Icon size={26} color={colors.onPrimary} />
                </PressableScale>
                <AppText variant="caption" color={isFocused ? 'primary' : 'textMuted'} style={{ marginTop: 2 }}>
                  {tab.label}
                </AppText>
              </View>
            )
          return (
            <PressableScale
              key={route.key}
              scaleTo={0.92}
              haptic="selection"
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isFocused }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 3 }}
            >
              <tab.Icon size={23} color={isFocused ? colors.primary : colors.textMuted} strokeWidth={isFocused ? 2.4 : 1.9} />
              <AppText variant="caption" color={isFocused ? 'primary' : 'textMuted'}>
                {tab.label}
              </AppText>
            </PressableScale>
          )
        })}
      </View>
    </View>
  )
}
