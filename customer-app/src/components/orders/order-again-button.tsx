import { router } from 'expo-router'
import { RotateCcw } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import type { AppOrderDetail } from '@/lib/contract'
import { useCatalog } from '@/lib/data/hooks'
import { reorderLines } from '@/lib/orders/reorder'
import { nextLineId, useCart } from '@/lib/stores/cart'
import { useTokens } from '@/theme/theme-context'

/** Puts what can still be ordered back in the bag and opens the review screen. */
export function OrderAgainButton({ order }: { order: AppOrderDetail }) {
  const { colors, space } = useTokens()
  const { data: catalog } = useCatalog()
  const add = useCart((state) => state.add)
  const [notice, setNotice] = useState<string | null>(null)
  if (!catalog) return null

  const reorder = () => {
    const { lines, skipped } = reorderLines(order, catalog.items, nextLineId)
    lines.forEach(add)
    if (lines.length === 0) return setNotice('None of these are on the menu right now.')
    if (skipped.length > 0) setNotice(`${skipped.join(', ')} ${skipped.length === 1 ? 'isn’t' : 'aren’t'} available, so we left ${skipped.length === 1 ? 'it' : 'them'} out.`)
    router.push('/checkout')
  }

  return (
    <View style={{ marginHorizontal: space.lg, gap: space.sm }}>
      <Button label="Order again" variant="secondary" size="lg" onPress={reorder} leading={<RotateCcw size={18} color={colors.primary} />} />
      {notice ? (
        <AppText variant="callout" color="textMuted" align="center" accessibilityRole="alert">
          {notice}
        </AppText>
      ) : null}
    </View>
  )
}
