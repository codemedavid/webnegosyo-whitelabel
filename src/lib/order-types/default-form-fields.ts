/**
 * The checkout fields a freshly created order type starts with.
 *
 * Until now only the database knew these: the tenant-insert trigger and the
 * `initialize_order_types_for_tenant` RPC seeded Dine In / Pick Up / Delivery,
 * while an order type added from the admin arrived with *no* fields at all —
 * the merchant landed on a configure page with an empty form and no hint that
 * checkout would collect nothing.
 *
 * This module is the app-side source of those defaults. The SQL in
 * `20260922090000_dine_in_phone_field.sql` mirrors it for the trigger path,
 * which cannot call TypeScript; the two must be changed together.
 *
 * Pure and dependency-free so the admin, the create action, and tests all read
 * the same answer.
 */

import type { CustomerFormField } from '@/types/database'
import type { OrderTypeKind } from '@/lib/order-types/order-type-kinds'
import { DELIVERY_ADDRESS_FIELD_NAME } from '@/lib/customer-details'
import { TABLE_NUMBER_FIELD_NAME } from '@/lib/order-table-number'

/** One seeded field, in the shape `createCustomerFormField` accepts. */
export interface DefaultFormField {
  field_name: string
  field_label: string
  field_type: CustomerFormField['field_type']
  is_required: boolean
  placeholder: string
  order_index: number
}

const CUSTOMER_NAME: Omit<DefaultFormField, 'is_required' | 'order_index'> = {
  field_name: 'customer_name',
  field_label: 'Full Name',
  field_type: 'text',
  placeholder: 'Enter your name',
}

const CUSTOMER_PHONE: Omit<DefaultFormField, 'is_required' | 'order_index'> = {
  field_name: 'customer_phone',
  field_label: 'Phone Number',
  field_type: 'phone',
  placeholder: 'Enter your phone number',
}

const TABLE_NUMBER: Omit<DefaultFormField, 'is_required' | 'order_index'> = {
  field_name: TABLE_NUMBER_FIELD_NAME,
  field_label: 'Table Number',
  field_type: 'text',
  placeholder: 'e.g. 12',
}

const DELIVERY_ADDRESS: Omit<DefaultFormField, 'is_required' | 'order_index'> = {
  field_name: DELIVERY_ADDRESS_FIELD_NAME,
  field_label: 'Delivery Address',
  field_type: 'textarea',
  placeholder: 'Enter your complete delivery address',
}

/** Number the fields in the order they are listed. */
function sequence(
  fields: readonly (Omit<DefaultFormField, 'order_index'>)[]
): DefaultFormField[] {
  return fields.map((field, index) => ({ ...field, order_index: index }))
}

/**
 * Dine-in carries a phone number too, and it is optional.
 *
 * A seated customer is already in the room, so nothing about the order needs a
 * number — but the kitchen calling about a sold-out item, an order left at the
 * counter, and every loyalty/marketing surface that keys on a phone number all
 * go dark without one. Optional is the whole point: a walk-in who does not want
 * to give a number is never blocked from ordering.
 */
const DINE_IN_FIELDS: readonly DefaultFormField[] = sequence([
  { ...CUSTOMER_NAME, is_required: false },
  { ...TABLE_NUMBER, is_required: false },
  { ...CUSTOMER_PHONE, is_required: false },
])

const PICKUP_LIKE_FIELDS: readonly DefaultFormField[] = sequence([
  { ...CUSTOMER_NAME, is_required: true },
  { ...CUSTOMER_PHONE, is_required: true },
])

const DELIVERY_FIELDS: readonly DefaultFormField[] = sequence([
  { ...CUSTOMER_NAME, is_required: true },
  { ...CUSTOMER_PHONE, is_required: true },
  { ...DELIVERY_ADDRESS, is_required: true },
])

/**
 * The fields a new order type of this kind starts with.
 *
 * Everything that is not dine-in or delivery is fulfilled at the counter, so it
 * gets the pickup set — an aggregator channel (Grab, foodpanda) or a custom
 * `other` channel still needs a name and a number to call.
 */
export function getDefaultFormFields(kind: OrderTypeKind): DefaultFormField[] {
  if (kind === 'dine_in') return DINE_IN_FIELDS.map((field) => ({ ...field }))
  if (kind === 'delivery') return DELIVERY_FIELDS.map((field) => ({ ...field }))
  return PICKUP_LIKE_FIELDS.map((field) => ({ ...field }))
}
