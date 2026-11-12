import { router } from 'expo-router'
import { Check, MapPin } from 'lucide-react-native'
import { ScrollView, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { Skeleton } from '@/components/ui/skeleton'
import { branchOptions, type BranchOption } from '@/lib/branch/availability'
import { MODE_LABELS } from '@/lib/branch/mode-label'
import { useCatalog } from '@/lib/data/hooks'
import { useCart } from '@/lib/stores/cart'
import { useTokens } from '@/theme/theme-context'

function BranchRow({ option, onPick }: { option: BranchOption; onPick: () => void }) {
  const { colors, space, radius } = useTokens()
  const { outlet, isSelected, isAvailable, reason } = option
  return (
    <PressableScale
      haptic="selection"
      scaleTo={0.985}
      disabled={!isAvailable}
      onPress={onPick}
      accessibilityLabel={[outlet.name, outlet.address, reason].filter(Boolean).join(', ')}
      accessibilityState={{ selected: isSelected, disabled: !isAvailable }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        minHeight: 72,
        borderRadius: radius.lg,
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected ? colors.primary : colors.border,
        backgroundColor: colors.surface,
        // Readable, not ghosted: the reason line must stay legible on a closed branch.
        opacity: isAvailable ? 1 : 0.7,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: isAvailable ? colors.primarySoft : colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MapPin size={20} color={isAvailable ? colors.onPrimarySoft : colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="headline" numberOfLines={1}>
          {outlet.name}
        </AppText>
        {outlet.address ? (
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {outlet.address}
          </AppText>
        ) : null}
        {reason ? (
          <AppText variant="caption" color="danger" style={{ marginTop: space.xxs }}>
            {reason}
          </AppText>
        ) : null}
      </View>
      {isSelected ? <Check size={22} color={colors.primary} strokeWidth={2.6} /> : null}
    </PressableScale>
  )
}

/** Form sheet over the menu: which branch to order from, for the mode already chosen. */
export default function BranchSheet() {
  const { colors, space } = useTokens()
  const { data: catalog, isPending } = useCatalog()
  const { mode, outletId, setOutlet } = useCart()
  const options = catalog ? branchOptions(catalog.outlets, mode, outletId ?? catalog.outlets[0]?.id ?? null) : []
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: space.lg, paddingTop: space.xl, gap: space.md }}>
      <View style={{ marginBottom: space.sm }}>
        <AppText variant="title" accessibilityRole="header">
          Choose a branch
        </AppText>
        <AppText variant="callout" color="textMuted">
          For {MODE_LABELS[mode].toLowerCase()}
        </AppText>
      </View>
      {isPending
        ? [0, 1].map((key) => <Skeleton key={key} height={72} />)
        : options.map((option) => (
            <BranchRow
              key={option.outlet.id}
              option={option}
              onPick={() => {
                setOutlet(option.outlet.id)
                router.back()
              }}
            />
          ))}
    </ScrollView>
  )
}
