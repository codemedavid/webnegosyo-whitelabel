'use client'

/**
 * The delivery address in every checkout design: the map-backed address
 * field (search leaning on the order's branch, a confirmed pin, warnings about
 * an odd spot) plus the three things a rider needs to find the door — unit,
 * landmark and a note. Classic and the shared `CheckoutFields` both render
 * this, so the designs cannot drift.
 */

import { useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { PinCheckView } from '@/components/shared/address-autocomplete'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { applyDeliveryAddressChange } from '@/lib/checkout/customer-field-input'
import {
  DELIVERY_LANDMARK_KEY,
  DELIVERY_RIDER_NOTE_KEY,
  DELIVERY_UNIT_KEY,
  formAsksFor,
  type DeliveryDetails,
} from '@/lib/delivery/delivery-details'
import { resolveDeliveryOrigin } from '@/lib/delivery/delivery-origin'
import { assessDeliveryPin, type PinWarning } from '@/lib/delivery/pin-assessment'
import { parseLatLng, type LatLng } from '@/lib/maps/apple/mapkit-address'

const AddressAutocomplete = dynamic(
  () => import('@/components/shared/address-autocomplete').then((mod) => ({ default: mod.AddressAutocomplete })),
  {
    loading: () => <input className="w-full rounded-lg px-3 py-2" placeholder="Loading address field..." disabled />,
    ssr: false,
  },
)

/** Long enough for "Blk 4 Lot 12, Phase 2, blue gate beside the sari-sari store". */
const DETAIL_MAX_LENGTH = 200

interface DetailFieldSpec {
  kind: keyof DeliveryDetails
  key: string
  label: string
  placeholder: string
}

const DETAIL_FIELDS: DetailFieldSpec[] = [
  { kind: 'unit', key: DELIVERY_UNIT_KEY, label: 'Unit / Floor / Building', placeholder: 'e.g. Unit 5B, 3rd floor' },
  { kind: 'landmark', key: DELIVERY_LANDMARK_KEY, label: 'Landmark', placeholder: 'e.g. Blue gate beside 7-Eleven' },
  { kind: 'riderNote', key: DELIVERY_RIDER_NOTE_KEY, label: 'Note to rider', placeholder: 'e.g. Call me when you arrive' },
]

function warningMessage(warning: PinWarning, placeName: string): string {
  if (warning.kind === 'at-store') return `This pin is on ${placeName} itself. Move it to your address.`
  const km = warning.distanceKm >= 10 ? Math.round(warning.distanceKm) : Math.round(warning.distanceKm * 10) / 10
  return `This pin is ${km} km from ${placeName}. Is that right?`
}

/** "Is this the right spot?" for the order's branch (or the store), as the map shows it. */
export function buildDeliveryPinCheck(input: {
  origin: LatLng | null
  radiusKm: number | null
  market: string | null | undefined
  lalamoveEnabled: boolean | null | undefined
  placeName: string
}): (point: LatLng) => PinCheckView | null {
  return (point) => {
    const assessment = assessDeliveryPin({
      pin: point,
      origin: input.origin,
      market: input.market,
      lalamoveEnabled: input.lalamoveEnabled,
      radiusKm: input.radiusKm,
    })
    if (assessment.isBlocked) {
      return { isBlocked: true, message: 'This spot is outside the Philippines. Move the pin to your delivery address.' }
    }
    return assessment.warning ? { isBlocked: false, message: warningMessage(assessment.warning, input.placeName) } : null
  }
}

interface CheckoutAddressFieldProps {
  checkout: UseCheckoutReturn
  fieldName: string
  placeholder?: string | null
  isRequired: boolean
  inputClassName: string
  labelClassName: string
}

export function CheckoutAddressField({
  checkout,
  fieldName,
  placeholder,
  isRequired,
  inputClassName,
  labelClassName,
}: CheckoutAddressFieldProps) {
  const { customerData, setCustomerData, tenant, outlet, formFields } = checkout

  const branch = outlet.choices.find((entry) => entry.outlet.id === outlet.selectedOutletId)?.outlet ?? null
  const origin = resolveDeliveryOrigin(tenant ?? {}, branch)
  const originLat = origin?.point.lat
  const originLng = origin?.point.lng
  const radiusKm = origin?.radiusKm ?? null
  const placeName = (origin?.source === 'outlet' ? branch?.name : tenant?.name)?.trim() || 'the store'
  const market = tenant?.lalamove_market
  const lalamoveEnabled = tenant?.lalamove_enabled

  const biasCenter = useMemo(
    () => (originLat !== undefined && originLng !== undefined ? { lat: originLat, lng: originLng } : null),
    [originLat, originLng],
  )
  const check = useMemo(
    () => buildDeliveryPinCheck({ origin: biasCenter, radiusKm, market, lalamoveEnabled, placeName }),
    [biasCenter, radiusKm, market, lalamoveEnabled, placeName],
  )

  const handleAddressChange = useCallback(
    (address: string, coordinates?: LatLng, meta?: { isConfirmed?: boolean }) => {
      setCustomerData((previous) => applyDeliveryAddressChange(previous, fieldName, address, coordinates, meta))
    },
    [fieldName, setCustomerData],
  )

  const fieldNames = formFields.map((field) => field.field_name)
  const detailFields = DETAIL_FIELDS.filter((spec) => !formAsksFor(spec.kind, fieldNames))

  return (
    <div className="space-y-3">
      <AddressAutocomplete
        value={customerData[fieldName] || ''}
        coordinates={parseLatLng(customerData.delivery_lat, customerData.delivery_lng)}
        onChange={handleAddressChange}
        placeholder={placeholder || 'Search your street, building or landmark'}
        required={isRequired}
        mapsEnabled={tenant?.mapbox_enabled ?? true}
        biasCenter={biasCenter}
        purpose="delivery"
        check={check}
      />
      {detailFields.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {detailFields.map((spec) => {
            const id = `checkout-${spec.key}`
            return (
              <div key={spec.key} className={spec.kind === 'riderNote' ? 'sm:col-span-2' : ''}>
                <label htmlFor={id} className={`mb-1 block text-sm ${labelClassName}`}>
                  {spec.label} <span className="opacity-60">(optional)</span>
                </label>
                <input
                  id={id}
                  type="text"
                  value={customerData[spec.key] || ''}
                  onChange={(event) => setCustomerData((previous) => ({ ...previous, [spec.key]: event.target.value }))}
                  placeholder={spec.placeholder}
                  maxLength={DETAIL_MAX_LENGTH}
                  className={inputClassName}
                />
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
