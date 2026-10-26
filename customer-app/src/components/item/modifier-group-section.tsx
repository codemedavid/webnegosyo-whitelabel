import { Check } from 'lucide-react-native'
import { useEffect } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { AppText } from '@/components/ui/app-text'
import { setOptionQuantity, toggleOption, type Selections } from '@/lib/cart/pricing'
import type { AppModifierGroup } from '@/lib/contract'
import { formatPriceDelta, groupSummary } from '@/lib/item/groups'
import { useTokens } from '@/theme/theme-context'
import { OptionRow, OptionText } from './option-row'
import { QuantityStepper } from './quantity-stepper'

const SHAKE = 6
const SHAKE_MS = 60

interface ModifierGroupSectionProps {
  group: AppModifierGroup
  selections: Selections
  onChange: (selections: Selections) => void
  /** Set once the customer tried to add with this group unmet; bumps on every new attempt. */
  attempt: number
  showIssue: boolean
  onLayout?: (event: LayoutChangeEvent) => void
}

function StatusChip({ isRequired, isSatisfied, showIssue }: { isRequired: boolean; isSatisfied: boolean; showIssue: boolean }) {
  const { colors, space, radius } = useTokens()
  if (isRequired && isSatisfied)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
        <Check size={14} color={colors.success} strokeWidth={3} />
        <AppText variant="caption" color="success">
          Done
        </AppText>
      </View>
    )
  const tone = showIssue ? colors.danger : isRequired ? colors.primarySoft : colors.surfaceMuted
  return (
    <View style={{ paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: tone }}>
      <AppText variant="label" color={showIssue ? 'surface' : isRequired ? 'onPrimarySoft' : 'textMuted'}>
        {isRequired ? 'REQUIRED' : 'OPTIONAL'}
      </AppText>
    </View>
  )
}

/** One option group: header with its rule and status, then radio, checkbox or stepper rows. */
export function ModifierGroupSection({ group, selections, onChange, attempt, showIssue, onLayout }: ModifierGroupSectionProps) {
  const { colors, space } = useTokens()
  const summary = groupSummary(group, selections)
  const picks = selections[group.id] ?? {}
  const isFull = group.maxSelect !== null && summary.picked >= group.maxSelect
  const offset = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))

  useEffect(() => {
    if (!showIssue || attempt === 0) return
    offset.set(
      withSequence(
        withTiming(-SHAKE, { duration: SHAKE_MS }),
        withTiming(SHAKE, { duration: SHAKE_MS }),
        withTiming(-SHAKE / 2, { duration: SHAKE_MS }),
        withTiming(0, { duration: SHAKE_MS }),
      ),
    )
  }, [attempt, showIssue, offset])

  return (
    <View onLayout={onLayout} style={{ paddingHorizontal: space.lg, paddingTop: space.xl }}>
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.xs }, shakeStyle]}>
        <View style={{ flex: 1 }}>
          <AppText variant="headline" accessibilityRole="header">
            {group.name}
          </AppText>
          <AppText variant="caption" color={showIssue ? 'danger' : 'textMuted'}>
            {summary.hint}
            {summary.picked > 0 && summary.kind !== 'single' ? ` · ${summary.picked} picked` : ''}
          </AppText>
        </View>
        <StatusChip isRequired={summary.isRequired} isSatisfied={summary.isSatisfied} showIssue={showIssue} />
      </Animated.View>
      {group.options.map((option, index) => {
        const count = picks[option.id] ?? 0
        const divider = index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null
        if (summary.kind === 'quantity') {
          const room = group.maxSelect === null ? Number.POSITIVE_INFINITY : group.maxSelect - (summary.picked - count)
          const delta = formatPriceDelta(option.priceDelta)
          return (
            <View
              key={option.id}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, opacity: option.isAvailable ? 1 : 0.5 }, divider]}
            >
              <OptionText name={option.name} isAvailable={option.isAvailable}>
                {delta ? (
                  <AppText variant="caption" color="textMuted">
                    {delta} each
                  </AppText>
                ) : null}
              </OptionText>
              {option.isAvailable ? (
                <QuantityStepper
                  size="sm"
                  label={option.name}
                  value={count}
                  max={room}
                  onChange={(next) => onChange(setOptionQuantity(group, selections, option.id, next))}
                />
              ) : null}
            </View>
          )
        }
        return (
          <View key={option.id} style={divider}>
            <OptionRow
              option={option}
              shape={summary.kind === 'single' ? 'radio' : 'checkbox'}
              isSelected={count > 0}
              isBlocked={summary.kind === 'multi' && isFull}
              onPress={() => onChange(toggleOption(group, selections, option.id))}
            />
          </View>
        )
      })}
    </View>
  )
}
