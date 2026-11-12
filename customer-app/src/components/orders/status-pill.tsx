import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import type { AppColors, AppOrderKind, AppOrderStatus } from '@/lib/contract'
import { statusPill, type StatusTone } from '@/lib/orders/status'
import { useTokens } from '@/theme/theme-context'

const TONE_COLORS: Record<StatusTone, { background: keyof AppColors; ink: keyof AppColors }> = {
  progress: { background: 'primarySoft', ink: 'onPrimarySoft' },
  ready: { background: 'accent', ink: 'onAccent' },
  done: { background: 'surfaceMuted', ink: 'textMuted' },
  cancelled: { background: 'surfaceMuted', ink: 'danger' },
}

export function StatusPill({ status, kind }: { status: AppOrderStatus; kind: AppOrderKind }) {
  const { colors, space, radius } = useTokens()
  const pill = statusPill(status, kind)
  const tone = TONE_COLORS[pill.tone]
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors[tone.background] }}>
      <AppText variant="caption" color={tone.ink}>
        {pill.label}
      </AppText>
    </View>
  )
}
