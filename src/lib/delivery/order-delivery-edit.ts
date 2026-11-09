/**
 * Changing where a placed order goes, and what the rider is told.
 *
 * Merchants fix an address on the phone with the customer, and customers drop
 * their own pin from a link. Both land here: pure rules for what may change and
 * what the order's answers become. The writer is `order-delivery-edit-server.ts`.
 */

import { z } from 'zod'
import { DELIVERY_PIN_ADDRESS_KEY, DELIVERY_PIN_CONFIRMED_KEY, DELIVERY_PIN_SKIPPED_KEY } from '@/lib/checkout/customer-field-input'
import { DELIVERY_ADDRESS_FIELD_NAME } from '@/lib/customer-details'
import { haversineDistanceKm, toLatLng, type LatLng } from '@/lib/delivery-fee'
import {
  classifyDetailKey,
  DELIVERY_LANDMARK_KEY,
  DELIVERY_RIDER_NOTE_KEY,
  DELIVERY_STORE_NOTE_KEY,
  DELIVERY_UNIT_KEY,
  type DeliveryDetails,
} from '@/lib/delivery/delivery-details'
import { isRebookableLalamoveStatus } from '@/lib/lalamove-status'

export const DELIVERY_PIN_KM_KEY = 'delivery_pin_km'
export const DELIVERY_PIN_UPDATED_BY_KEY = 'delivery_pin_updated_by'
export const DELIVERY_PIN_UPDATED_AT_KEY = 'delivery_pin_updated_at'

export type DeliveryEditor = 'merchant' | 'customer'

const ADDRESS_MAX_LENGTH = 500
const DETAIL_MAX_LENGTH = 200
const STORE_NOTE_MAX_LENGTH = 300

const pinSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

const detailSchema = z.string().trim().max(DETAIL_MAX_LENGTH)

/** What a merchant may change. Absent = leave alone; '' = clear it. */
export const merchantDeliveryPatchSchema = z.object({
  address: z.string().trim().min(1).max(ADDRESS_MAX_LENGTH).optional(),
  pin: pinSchema.optional(),
  unit: detailSchema.optional(),
  landmark: detailSchema.optional(),
  riderNote: detailSchema.optional(),
  storeNote: z.string().trim().max(STORE_NOTE_MAX_LENGTH).optional(),
}).strict()

/** What a customer sends from a pin link: a pin, always, and never the store's own note. */
export const customerDeliveryPatchSchema = z.object({
  address: z.string().trim().min(1).max(ADDRESS_MAX_LENGTH).optional(),
  pin: pinSchema,
  unit: detailSchema.optional(),
  landmark: detailSchema.optional(),
  riderNote: detailSchema.optional(),
}).strict()

export type DeliveryPatch = z.infer<typeof merchantDeliveryPatchSchema>

export interface DeliveryEditGateInput {
  status: string | null | undefined
  lalamoveOrderId: string | null | undefined
  lalamoveStatus: string | null | undefined
}

const FINISHED_ORDER_STATUSES = new Set(['delivered', 'cancelled', 'completed'])

export const DELIVERY_EDIT_FINISHED_MESSAGE = 'This order is finished, so its delivery details can no longer change.'
export const DELIVERY_EDIT_BOOKED_MESSAGE = 'A rider is already booked. Cancel the booking first, then change the delivery details.'

/** Why this order's delivery can't change now, or null. A rider on the way has the old details. */
export function deliveryEditRefusal({ status, lalamoveOrderId, lalamoveStatus }: DeliveryEditGateInput): string | null {
  if (status && FINISHED_ORDER_STATUSES.has(status)) return DELIVERY_EDIT_FINISHED_MESSAGE
  if (lalamoveStatus === 'BOOKING') return DELIVERY_EDIT_BOOKED_MESSAGE
  if (lalamoveOrderId && String(lalamoveOrderId).trim() !== '' && !isRebookableLalamoveStatus(lalamoveStatus)) {
    return DELIVERY_EDIT_BOOKED_MESSAGE
  }
  return null
}

function withOptional(answers: Record<string, unknown>, key: string, value: string | undefined): Record<string, unknown> {
  if (value === undefined) return answers
  if (value !== '') return { ...answers, [key]: value }
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  const { [key]: _cleared, ...rest } = answers
  return rest
}

/**
 * A detail the merchant cleared, wherever it was answered. The edit form shows a
 * store's own question ("Nearest Landmark") as the landmark, and the rider's text
 * falls back to it, so clearing only the built-in key would leave the rider
 * reading the old words. A changed detail needs none of this: the built-in key wins.
 */
function withDetailCleared(answers: Record<string, unknown>, kind: keyof DeliveryDetails, key: string, value: string | undefined): Record<string, unknown> {
  const next = withOptional(answers, key, value)
  if (value !== '') return next
  return Object.fromEntries(Object.entries(next).filter(([name]) => classifyDetailKey(name) !== kind))
}

export function roundedKm(from: LatLng, to: LatLng): number {
  return Math.round(haversineDistanceKm(from.lat, from.lng, to.lat, to.lng) * 10) / 10
}

export interface ApplyDeliveryPatchInput {
  current: Readonly<Record<string, unknown>>
  patch: DeliveryPatch
  editor: DeliveryEditor
  now: Date
  /** Where the trip starts, so the merchant can see how far the new pin is. */
  origin?: LatLng | null
}

export interface AppliedDeliveryPatch {
  answers: Record<string, unknown>
  /** The rider's destination changed: a quote made for the old one must not be booked. */
  isDestinationChanged: boolean
}

/** The order's answers after the edit. Never touches the fee: that stays the merchant's call. */
export function applyDeliveryPatch({ current, patch, editor, now, origin }: ApplyDeliveryPatchInput): AppliedDeliveryPatch {
  const oldPin = toLatLng(current.delivery_lat, current.delivery_lng)
  const isPinChanged = patch.pin !== undefined && (oldPin?.lat !== patch.pin.lat || oldPin?.lng !== patch.pin.lng)
  const isAddressChanged = patch.address !== undefined && patch.address !== current[DELIVERY_ADDRESS_FIELD_NAME]

  let answers: Record<string, unknown> = { ...current }
  answers = withDetailCleared(answers, 'unit', DELIVERY_UNIT_KEY, patch.unit)
  answers = withDetailCleared(answers, 'landmark', DELIVERY_LANDMARK_KEY, patch.landmark)
  answers = withDetailCleared(answers, 'riderNote', DELIVERY_RIDER_NOTE_KEY, patch.riderNote)
  answers = withOptional(answers, DELIVERY_STORE_NOTE_KEY, patch.storeNote)
  if (isAddressChanged) answers = { ...answers, [DELIVERY_ADDRESS_FIELD_NAME]: patch.address }

  if (isPinChanged && patch.pin) {
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    const { [DELIVERY_PIN_SKIPPED_KEY]: _skipped, [DELIVERY_PIN_KM_KEY]: _oldKm, ...rest } = answers
    answers = {
      ...rest,
      delivery_lat: String(patch.pin.lat),
      delivery_lng: String(patch.pin.lng),
      [DELIVERY_PIN_ADDRESS_KEY]: answers[DELIVERY_ADDRESS_FIELD_NAME] ?? '',
      [DELIVERY_PIN_CONFIRMED_KEY]: 'true',
      [DELIVERY_PIN_UPDATED_BY_KEY]: editor,
      [DELIVERY_PIN_UPDATED_AT_KEY]: now.toISOString(),
      ...(origin ? { [DELIVERY_PIN_KM_KEY]: String(roundedKm(origin, patch.pin)) } : {}),
    }
  }

  // New words with no pin sent: the old pin is for the old address, and a rider would still be sent there.
  if (isAddressChanged && patch.pin === undefined) {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const {
      delivery_lat: _lat,
      delivery_lng: _lng,
      [DELIVERY_PIN_ADDRESS_KEY]: _label,
      [DELIVERY_PIN_CONFIRMED_KEY]: _confirmed,
      [DELIVERY_PIN_KM_KEY]: _km,
      ...withoutPin
    } = answers
    /* eslint-enable @typescript-eslint/no-unused-vars */
    answers = withoutPin
  }

  return { answers, isDestinationChanged: isPinChanged || isAddressChanged }
}
