import { Check, TicketPercent, X } from 'lucide-react-native'
import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { VoucherResult, VoucherTerms } from '@/lib/checkout/voucher'
import { useVoucherPreview } from '@/lib/data/hooks'
import { formatPeso } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'

interface VoucherRowProps {
  voucher: VoucherTerms | null
  result: VoucherResult | null
  onChange: (voucher: VoucherTerms | null) => void
}

function AppliedVoucher({ voucher, result, onRemove }: { voucher: VoucherTerms; result: VoucherResult | null; onRemove: () => void }) {
  const { colors, space, radius } = useTokens()
  const isApplied = result?.isApplied === true
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }}>
      {isApplied ? <Check size={18} color={colors.success} /> : <TicketPercent size={18} color={colors.warning} />}
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">
          {voucher.code} · {voucher.label}
        </AppText>
        <AppText variant="caption" color={isApplied ? 'success' : 'text'} accessibilityLiveRegion="polite">
          {result?.isApplied ? `You save ${formatPeso(result.discountCentavos)}` : (result?.reason ?? '')}
        </AppText>
      </View>
      <PressableScale
        onPress={onRemove}
        accessibilityLabel={`Remove voucher ${voucher.code}`}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={18} color={colors.textMuted} />
      </PressableScale>
    </View>
  )
}

/** Type a code, check it with the store, keep it while the bag changes. */
export function VoucherRow({ voucher, result, onChange }: VoucherRowProps) {
  const { colors, space, radius, type } = useTokens()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const preview = useVoucherPreview()

  if (voucher) return <AppliedVoucher voucher={voucher} result={result} onRemove={() => onChange(null)} />

  const apply = () => {
    const trimmed = code.trim()
    if (!trimmed) return
    setError(null)
    preview.mutate(trimmed, {
      onSuccess: (terms) => {
        if (!terms) return setError('That code isn’t valid for this store.')
        onChange(terms)
        setCode('')
      },
      onError: () => setError('We couldn’t check that code. Try again.'),
    })
  }

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingHorizontal: space.md,
            minHeight: 46,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <TicketPercent size={18} color={colors.textMuted} />
          <TextInput
            value={code}
            onChangeText={(next) => setCode(next.toUpperCase())}
            onSubmitEditing={apply}
            placeholder="Voucher code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Voucher code"
            style={[type.body, { flex: 1, color: colors.text, paddingVertical: space.sm }]}
          />
        </View>
        <Button label="Apply" variant="secondary" onPress={apply} isBusy={preview.isPending} disabled={code.trim() === ''} />
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  )
}
