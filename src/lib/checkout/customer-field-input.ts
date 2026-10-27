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

/** Hidden keys the address field keeps beside the coordinates. */
export const DELIVERY_PIN_ADDRESS_KEY = 'delivery_pin_address'
export const DELIVERY_PIN_CONFIRMED_KEY = 'delivery_pin_confirmed'

export interface AddressChangeMeta {
  /** The customer confirmed this spot on the map. */
  isConfirmed?: boolean
}

function normalizeAddressText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** A text edit keeps the pin while the label it was picked with is still there ("Unit 5B, " + label). */
function isEditOfPickedAddress(previous: Readonly<Record<string, string>>, address: string): boolean {
  const pickedLabel = previous[DELIVERY_PIN_ADDRESS_KEY]
  if (!pickedLabel || !previous.delivery_lat || !previous.delivery_lng) return false
  return normalizeAddressText(address).includes(normalizeAddressText(pickedLabel))
}

/**
 * The customer data after the address field changes.
 *
 * A pick stores its coordinates and the label it was picked with. A text edit
 * that keeps that label (adding a unit or a landmark) keeps the pin; any other
 * edit drops it, so the fee path treats the address as "no coordinates" and
 * forces a re-pick rather than quoting a pin for a different place.
 */
export function applyDeliveryAddressChange(
  previous: Readonly<Record<string, string>>,
  fieldName: string,
  address: string,
  coordinates: AddressCoordinates | null | undefined,
  meta: AddressChangeMeta = {},
): Record<string, string> {
  if (!coordinates && isEditOfPickedAddress(previous, address)) return { ...previous, [fieldName]: address }

  // Strip the old pin without mutating the previous map.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const {
    delivery_lat: _lat,
    delivery_lng: _lng,
    [DELIVERY_PIN_ADDRESS_KEY]: _label,
    [DELIVERY_PIN_CONFIRMED_KEY]: _confirmed,
    ...rest
  } = previous
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const next = { ...rest, [fieldName]: address }
  if (!coordinates) return next
  return {
    ...next,
    delivery_lat: String(coordinates.lat),
    delivery_lng: String(coordinates.lng),
    [DELIVERY_PIN_ADDRESS_KEY]: address,
    ...(meta.isConfirmed ? { [DELIVERY_PIN_CONFIRMED_KEY]: 'true' } : {}),
  }
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
