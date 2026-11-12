import { Check, TicketPercent, X } from 'lucide-react-native'
import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { PressableScale } from '@/components/ui/pressable-scale'
import { AppApiError } from '@/lib/api/app-client'
import type { VoucherStatus } from '@/lib/checkout/voucher'
import { formatPeso } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'
import type { VoucherModel } from './use-voucher'

/** The line under the applied code: always the store's answer for the bag as it is now. */
function statusLine(voucher: VoucherModel): { text: string; tone: 'success' | 'text' | 'textMuted' | 'danger' } {
  const lines: Record<VoucherStatus, { text: string; tone: 'success' | 'text' | 'textMuted' | 'danger' }> = {
    none: { text: '', tone: 'textMuted' },
    checking: { text: 'Checking with the store…', tone: 'textMuted' },
    applied: { text: `You save ${formatPeso(voucher.discountCentavos)}`, tone: 'success' },
    notApplied: { text: voucher.preview?.reason ?? 'Doesn’t apply to this order yet', tone: 'text' },
    invalid: { text: 'This code no longer works here, so your order goes without it.', tone: 'danger' },
    failed: { text: 'We couldn’t check this code. Tap to try again.', tone: 'danger' },
  }
  return lines[voucher.status]
}

function AppliedVoucher({ voucher }: { voucher: VoucherModel }) {
  const { colors, space, radius } = useTokens()
  const isApplied = voucher.status === 'applied'
  const line = statusLine(voucher)
  const label = voucher.status !== 'checking' && voucher.preview ? voucher.preview.label : null
  const body = (
    <View style={{ flex: 1 }}>
      <AppText variant="bodyStrong">{label ? `${voucher.code} · ${label}` : voucher.code}</AppText>
      <AppText variant="caption" color={line.tone} accessibilityLiveRegion="polite">
        {line.text}
      </AppText>
    </View>
  )
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }}>
      {isApplied ? <Check size={18} color={colors.success} /> : <TicketPercent size={18} color={voucher.status === 'checking' ? colors.textMuted : colors.warning} />}
      {voucher.status === 'failed' ? (
        <PressableScale onPress={voucher.retry} accessibilityRole="button" accessibilityLabel={`Check voucher ${voucher.code} again`} style={{ flex: 1 }}>
          {body}
        </PressableScale>
      ) : (
        body
      )}
      <PressableScale
        onPress={voucher.remove}
        accessibilityLabel={`Remove voucher ${voucher.code}`}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={18} color={colors.textMuted} />
      </PressableScale>
    </View>
  )
}

const CHECK_FAILED = 'We couldn’t check that code. Try again.'

/** Type a code, check it with the store, then keep showing the store's answer as the bag changes. */
export function VoucherRow({ voucher }: { voucher: VoucherModel }) {
  const { colors, space, radius, type } = useTokens()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (voucher.code) return <AppliedVoucher voucher={voucher} />

  const apply = async () => {
    const trimmed = code.trim()
    if (!trimmed || voucher.isApplying) return
    setError(null)
    try {
      const outcome = await voucher.apply(trimmed)
      if (outcome === 'notFound') return setError('That code isn’t valid for this store.')
      if (outcome === 'nothingToPreview') return setError('Add something to your bag first.')
      setCode('')
    } catch (caught) {
      // A refusal or limit carries the store's own words; an outage gets ours.
      setError(caught instanceof AppApiError && (caught.code === 'refused' || caught.code === 'rate_limited') ? caught.message : CHECK_FAILED)
    }
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
            onSubmitEditing={() => void apply()}
            maxLength={40}
            placeholder="Voucher code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Voucher code"
            style={[type.body, { flex: 1, color: colors.text, paddingVertical: space.sm }]}
          />
        </View>
        <Button label="Apply" variant="secondary" onPress={() => void apply()} isBusy={voucher.isApplying} disabled={code.trim() === ''} />
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  )
}
