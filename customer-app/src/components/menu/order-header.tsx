import { router } from 'expo-router'
import { ChevronDown, MapPin, Search, X } from 'lucide-react-native'
import { TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { AppFeatures, AppOutlet } from '@/lib/contract'
import type { OrderMode } from '@/lib/stores/cart'
import { useTokens } from '@/theme/theme-context'

const MODE_LABELS: Record<OrderMode, string> = { pickup: 'Pick up', delivery: 'Delivery', dineIn: 'Dine in' }
const MODE_PREPOSITION: Record<OrderMode, string> = { pickup: 'Pick up from', delivery: 'Delivering from', dineIn: 'Dining at' }

interface OrderHeaderProps {
  features: AppFeatures
  mode: OrderMode
  onModeChange: (mode: OrderMode) => void
  outlet: AppOutlet | undefined
  query: string
  onQueryChange: (query: string) => void
}

export function OrderHeader({ features, mode, onModeChange, outlet, query, onQueryChange }: OrderHeaderProps) {
  const { colors, space, radius, type } = useTokens()
  const modes = (Object.keys(MODE_LABELS) as OrderMode[]).filter((candidate) => features.orderModes[candidate])
  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
      {modes.length > 1 ? (
        <SegmentedControl
          accessibilityLabel="How do you want your order?"
          options={modes.map((value) => ({ value, label: MODE_LABELS[value] }))}
          value={mode}
          onChange={onModeChange}
        />
      ) : null}
      {features.multiBranch ? (
        <PressableScale
          onPress={() => router.push('/branch')}
          accessibilityLabel={`${MODE_PREPOSITION[mode]} ${outlet?.name ?? 'choose a branch'}. Change branch`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 }}
        >
          <MapPin size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color="textMuted">
              {MODE_PREPOSITION[mode]}
            </AppText>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {outlet?.name ?? 'Choose a branch'}
            </AppText>
          </View>
          <ChevronDown size={18} color={colors.textMuted} />
        </PressableScale>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.md,
          minHeight: 44,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Search size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search the menu"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          accessibilityLabel="Search the menu"
          style={[type.body, { flex: 1, color: colors.text, paddingVertical: space.sm }]}
        />
        {query ? (
          <PressableScale onPress={() => onQueryChange('')} accessibilityLabel="Clear search">
            <X size={18} color={colors.textMuted} />
          </PressableScale>
        ) : null}
      </View>
    </View>
  )
}
