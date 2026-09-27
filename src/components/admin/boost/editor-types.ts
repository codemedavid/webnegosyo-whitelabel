import type { BoostItem } from '@/lib/boost/workspace'
import type { OfferTheme } from '@/components/customer/offers/offer-theme'
import type { ItemLookup } from './boost-model'

/** What every offer editor receives from the Boost Sales home. */
export interface EditorEnvironment {
  tenantId: string
  tenantSlug: string
  items: readonly BoostItem[]
  itemsById: ItemLookup
  theme: OfferTheme
  cartTheme: OfferTheme
  /** Close the sheet, confirm, and reload the workspace. */
  onSaved: (message: string) => void
  onClose: () => void
}
