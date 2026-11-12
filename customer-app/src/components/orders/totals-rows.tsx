import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { formatPeso } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'

export interface TotalsRowsProps {
  subtotalCentavos: number
  discountCentavos: number
  deliveryFeeCentavos: number
  serviceChargeCentavos?: number
  totalCentavos: number
  /** Shown instead of a ₱0 fee while a delivery address has not been quoted. */
  deliveryNote?: string | null
  showDelivery: boolean
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'textMuted' }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText variant="body" color={tone === 'success' ? 'success' : 'textMuted'}>
        {label}
      </AppText>
      <AppText variant="body" color={tone ?? 'text'}>
        {value}
      </AppText>
    </View>
  )
}

/** Subtotal → discounts → fees → total, the same on the review screen and the receipt. */
export function TotalsRows(props: TotalsRowsProps) {
  const { colors, space } = useTokens()
  const { subtotalCentavos, discountCentavos, deliveryFeeCentavos, serviceChargeCentavos = 0, totalCentavos } = props
  return (
    <View style={{ gap: space.sm }}>
      <Row label="Subtotal" value={formatPeso(subtotalCentavos)} />
      {discountCentavos > 0 ? <Row label="Savings" value={`−${formatPeso(discountCentavos)}`} tone="success" /> : null}
      {props.showDelivery ? (
        <Row label="Delivery" value={props.deliveryNote ?? formatPeso(deliveryFeeCentavos)} tone={props.deliveryNote ? 'textMuted' : undefined} />
      ) : null}
      {serviceChargeCentavos > 0 ? <Row label="Service charge" value={formatPeso(serviceChargeCentavos)} /> : null}
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.xs }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <AppText variant="headline">Total</AppText>
        <AppText variant="title">{formatPeso(totalCentavos)}</AppText>
      </View>
    </View>
  )
}
