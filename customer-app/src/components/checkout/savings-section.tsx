import { Gift } from 'lucide-react-native'
import { Switch, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { formatPeso } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'
import { CheckoutSection } from './checkout-section'
import type { CheckoutModel } from './use-checkout'
import { VoucherRow } from './voucher-row'

function RewardToggle({ model }: { model: CheckoutModel }) {
  const { colors, space } = useTokens()
  const { reward } = model
  if (!reward) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}>
      <Gift size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{reward.label}</AppText>
        <AppText variant="caption" color={model.isUsingReward ? 'success' : 'textMuted'} accessibilityLiveRegion="polite">
          {!model.canUseReward
            ? 'Add a dish to use it on this order'
            : model.isUsingReward
              ? `Up to ${formatPeso(model.rewardCentavos)} off · the store confirms which item`
              : 'Ready to use on this order'}
        </AppText>
      </View>
      <Switch
        value={model.isUsingReward}
        onValueChange={model.setIsUsingReward}
        disabled={!model.canUseReward}
        trackColor={{ true: colors.primary, false: colors.border }}
        accessibilityLabel={`Use reward: ${reward.label}`}
      />
    </View>
  )
}

export function SavingsSection({ model }: { model: CheckoutModel }) {
  const { colors, space } = useTokens()
  return (
    <CheckoutSection title="Rewards & vouchers">
      <View style={{ gap: space.md }}>
        <RewardToggle model={model} />
        {model.reward ? <View style={{ height: 1, backgroundColor: colors.border }} /> : null}
        <VoucherRow voucher={model.voucher} result={model.voucherResult} onChange={model.setVoucher} />
      </View>
    </CheckoutSection>
  )
}
