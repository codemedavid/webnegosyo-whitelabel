import { Trash2 } from 'lucide-react-native'
import { View } from 'react-native'
import { QuantityStepper } from '@/components/item/quantity-stepper'
import { AppText } from '@/components/ui/app-text'
import { ItemImage } from '@/components/ui/item-image'
import { PressableScale } from '@/components/ui/pressable-scale'
import { MAX_LINE_QUANTITY, type CartLine } from '@/lib/cart/cart'
import { formatPeso } from '@/lib/money'
import { useCart } from '@/lib/stores/cart'
import { useTokens } from '@/theme/theme-context'

const THUMB = 56

/** A bag line: photo, picks, line price, and a stepper that removes the line at zero. */
export function BagLineRow({ line, isLast }: { line: CartLine; isLast: boolean }) {
  const { colors, space } = useTokens()
  const setQuantity = useCart((state) => state.setQuantity)
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.md,
        paddingVertical: space.md,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <ItemImage uri={line.imageUrl} name={line.name} style={{ width: THUMB, height: THUMB }} />
      <View style={{ flex: 1, gap: space.xxs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
          <AppText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
            {line.name}
          </AppText>
          <AppText variant="price">{formatPeso(line.unitCentavos * line.quantity)}</AppText>
        </View>
        {line.optionLabels.length > 0 ? (
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {line.optionLabels.join(' · ')}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm }}>
          <PressableScale
            haptic="light"
            onPress={() => setQuantity(line.lineId, 0)}
            accessibilityLabel={`Remove ${line.name}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 32 }}
          >
            <Trash2 size={16} color={colors.textMuted} />
            <AppText variant="callout" color="textMuted">
              Remove
            </AppText>
          </PressableScale>
          <QuantityStepper
            size="sm"
            value={line.quantity}
            min={0}
            max={MAX_LINE_QUANTITY}
            label={line.name}
            onChange={(quantity) => setQuantity(line.lineId, quantity)}
          />
        </View>
      </View>
    </View>
  )
}
