/**
 * How a checkout's delivery address offers the map (Page Designer):
 * `buttons` beside the box, `links` under it, `map` shown below it, `hidden`
 * for typing only. Pure, so the storefront and tests reach the same answer.
 */

export type AddressMapChoice = 'buttons' | 'links' | 'map' | 'hidden'
export type AddressMapDisplay = Exclude<AddressMapChoice, 'hidden'>

interface AddressMapStore {
  lalamove_enabled?: boolean | null
  distance_delivery_enabled?: boolean | null
}

/**
 * A store on Lalamove or per-km pricing can't take a delivery without a pin
 * (`isDeliveryBlocked` in useCheckout), so it can't hide the map: it gets the
 * tidiest way of offering it instead.
 */
export function resolveAddressMap(choice: AddressMapChoice | undefined, store: AddressMapStore | null | undefined): AddressMapChoice {
  if (choice !== 'hidden') return choice ?? 'buttons'
  return store?.lalamove_enabled || store?.distance_delivery_enabled ? 'links' : 'hidden'
}
