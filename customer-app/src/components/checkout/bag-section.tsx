import { router } from 'expo-router'
import type { CartLine } from '@/lib/cart/cart'
import { BagLineRow } from './bag-line-row'
import { CheckoutSection } from './checkout-section'

export function BagSection({ lines, itemCount }: { lines: CartLine[]; itemCount: number }) {
  return (
    <CheckoutSection title={`Your bag · ${itemCount} item${itemCount === 1 ? '' : 's'}`} actionLabel="Add more" onAction={() => router.navigate('/order')}>
      {lines.map((line, index) => (
        <BagLineRow key={line.lineId} line={line} isLast={index === lines.length - 1} />
      ))}
    </CheckoutSection>
  )
}
