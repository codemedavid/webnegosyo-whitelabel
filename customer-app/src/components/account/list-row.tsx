import { ChevronRight, type LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppColors } from '@/lib/contract'
import { useTokens } from '@/theme/theme-context'

interface ListRowProps {
  Icon: LucideIcon
  label: string
  detail?: string
  tone?: keyof AppColors
  onPress?: () => void
  /** Replaces the chevron (a switch, a badge). */
  trailing?: ReactNode
  accessibilityHint?: string
}

/** One settings row: icon, label, optional detail, chevron when it goes somewhere. */
export function ListRow({ Icon, label, detail, tone = 'text', onPress, trailing, accessibilityHint }: ListRowProps) {
  const { colors, space } = useTokens()
  const body = (
    <>
      <Icon size={20} color={tone === 'text' ? colors.textMuted : colors[tone]} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" color={tone}>
          {label}
        </AppText>
        {detail ? (
          <AppText variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 1 }}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {trailing ?? (onPress ? <ChevronRight size={18} color={colors.textMuted} /> : null)}
    </>
  )
  const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md, minHeight: 56, paddingHorizontal: space.lg, paddingVertical: space.sm }
  if (!onPress) return <View style={rowStyle}>{body}</View>
  return (
    <PressableScale scaleTo={0.99} onPress={onPress} accessibilityLabel={detail ? `${label}, ${detail}` : label} accessibilityHint={accessibilityHint} style={rowStyle}>
      {body}
    </PressableScale>
  )
}

/** A white card that groups rows with hairline dividers. */
export function ListGroup({ title, children }: { title?: string; children: ReactNode[] | ReactNode }) {
  const { colors, space, radius, elevation } = useTokens()
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean)
  return (
    <View style={{ marginHorizontal: space.lg }}>
      {title ? (
        <AppText variant="label" color="textMuted" style={{ marginBottom: space.sm, marginLeft: space.xs }} accessibilityRole="header">
          {title.toUpperCase()}
        </AppText>
      ) : null}
      <View style={{ borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden', ...elevation.card }}>
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: space.lg + 20 + space.md }} /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  )
}
