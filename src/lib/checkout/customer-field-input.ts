/**
 * Input transforms for the checkout customer form.
 *
 * Classic and the shared CheckoutFields each carried their own copy of these
 * (the address handler mutated its draft with `delete`). One pure copy now
 * serves both, so the two forms cannot drift apart.
 */

export interface AddressCoordinates {
  lat: number
  lng: number
}

/**
 * The customer data after the address field changes. A geocoded pick stores its
 * coordinates; a free-text edit drops them, so the fee path treats the address
 * as "no coordinates" and forces a re-pick rather than quoting a stale pin.
 */
export function applyDeliveryAddressChange(
  previous: Readonly<Record<string, string>>,
  fieldName: string,
  address: string,
  coordinates: AddressCoordinates | null | undefined
): Record<string, string> {
  // Strip stale coordinates without mutating the previous map.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { delivery_lat: _lat, delivery_lng: _lng, ...rest } = previous
  const next = { ...rest, [fieldName]: address }
  if (!coordinates) return next
  return { ...next, delivery_lat: String(coordinates.lat), delivery_lng: String(coordinates.lng) }
}

/** Standard PH mobile number length, without the country code. */
const PH_MOBILE_DIGITS = 10
const PH_COUNTRY_CODE = '+63'

const nonDigits = /\D/g

/** The local digits shown in the field for a stored PH number. */
export function phPhoneDisplayDigits(value: string): string {
  if (value.startsWith(PH_COUNTRY_CODE)) return value.slice(PH_COUNTRY_CODE.length).replace(nonDigits, '')
  if (value.startsWith('+')) return value.slice(1).replace(nonDigits, '')
  if (value.startsWith('0')) return value.slice(1).replace(nonDigits, '')
  return value.replace(nonDigits, '')
}

/** What a typed PH number is stored as: digits only, no leading 0, +63 prefix. */
export function toPhPhoneValue(typed: string): string {
  const digits = typed.replace(nonDigits, '')
  const withoutTrunkZero = digits.startsWith('0') ? digits.slice(1) : digits
  const local = withoutTrunkZero.slice(0, PH_MOBILE_DIGITS)
  return local ? `${PH_COUNTRY_CODE}${local}` : ''
}

/** How many of the 10 local digits a stored PH number has. */
export function phPhoneDigitCount(value: string): number {
  return value.replace(nonDigits, '').replace(/^63/, '').replace(/^0/, '').length
}

export const PH_PHONE_MAX_DIGITS = PH_MOBILE_DIGITS
