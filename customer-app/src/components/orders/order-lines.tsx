import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import type { AppOrderLine } from '@/lib/contract'
import { formatPeso, toCentavos } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'

export function OrderLines({ lines }: { lines: AppOrderLine[] }) {
  const { space } = useTokens()
  return (
    <View style={{ gap: space.md }}>
      {lines.map((line) => (
        <View key={line.id} style={{ flexDirection: 'row', gap: space.md }}>
          <AppText variant="bodyStrong" style={{ minWidth: 28 }}>
            {line.quantity}×
          </AppText>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{line.name}</AppText>
            {line.options.length > 0 ? (
              <AppText variant="caption" color="textMuted">
                {line.options.join(' · ')}
              </AppText>
            ) : null}
          </View>
          <AppText variant="body">{formatPeso(toCentavos(line.lineTotal))}</AppText>
        </View>
      ))}
    </View>
  )
}
