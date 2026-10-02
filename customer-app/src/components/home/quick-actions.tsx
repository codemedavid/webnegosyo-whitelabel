import { Bike, Gift, QrCode, ShoppingBag, UtensilsCrossed, type LucideIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppQuickAction } from '@/lib/contract'
import { useTokens } from '@/theme/theme-context'

const ACTIONS: Record<AppQuickAction, { label: string; hint: string; Icon: LucideIcon }> = {
  pickup: { label: 'Pick up', hint: 'Skip the line', Icon: ShoppingBag },
  delivery: { label: 'Delivery', hint: 'To your door', Icon: Bike },
  dineIn: { label: 'Dine in', hint: 'Order at the table', Icon: UtensilsCrossed },
  menu: { label: 'Menu', hint: 'Browse it all', Icon: UtensilsCrossed },
  rewards: { label: 'Rewards', hint: 'Your stamps', Icon: Gift },
  scan: { label: 'Scan', hint: 'Member QR', Icon: QrCode },
}

interface QuickActionsProps {
  actions: AppQuickAction[]
  onAction: (action: AppQuickAction) => void
}

export function QuickActions({ actions, onAction }: QuickActionsProps) {
  const { colors, space, radius, elevation } = useTokens()
  return (
    <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg }}>
      {actions.map((action) => {
        const { label, hint, Icon } = ACTIONS[action]
        return (
          <PressableScale
            key={action}
            haptic="light"
            onPress={() => onAction(action)}
            accessibilityLabel={`${label}. ${hint}`}
            style={{
              flex: 1,
              padding: space.md,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              ...elevation.card,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: space.sm,
              }}
            >
              <Icon size={20} color={colors.onPrimarySoft} />
            </View>
            <AppText variant="bodyStrong">{label}</AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {hint}
            </AppText>
          </PressableScale>
        )
      })}
    </View>
  )
}
