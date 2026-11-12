import { router } from 'expo-router'
import { AddressSearchSheet } from '@/components/checkout/address-search-sheet'
import { placeToDelivery } from '@/lib/checkout/delivery-quote'
import type { AppPlace } from '@/lib/contract'
import { useCart } from '@/lib/stores/cart'

/** A route (not an RN Modal) so the keyboard and the first tap on a result behave. */
export default function AddressSearchScreen() {
  const outletId = useCart((state) => state.outletId)
  const setDeliveryPlace = useCart((state) => state.setDeliveryPlace)
  const pick = (place: AppPlace) => {
    // Same as the checkout's `address.pick`: the picked place is the one quoted and sent.
    setDeliveryPlace(placeToDelivery(place))
    router.back()
  }
  return <AddressSearchSheet outletId={outletId} onPick={pick} onClose={() => router.back()} />
}
