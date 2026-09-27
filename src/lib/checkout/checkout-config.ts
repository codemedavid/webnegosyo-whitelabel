/**
 * Everything checkout needs besides the tenant row, loaded ONCE on the server.
 *
 * Checkout used to fetch this from the browser as a chain — tenant, then order
 * types, then form fields + payment methods — and only after the page's
 * JavaScript had downloaded and hydrated. Three sequential round trips behind a
 * spinner, and another pair on every order-type switch. The server now reads it
 * all in one parallel batch (see load-checkout-config.ts) and the page arrives
 * with it; switching order type is a lookup in the maps below, not a request.
 *
 * Pure and client-safe: the hook imports these helpers, so nothing here may
 * touch a database client.
 */
import type { CustomerFormField, OrderType, Outlet, PaymentMethod } from '@/types/database'

export interface CheckoutConfig {
  /** Web-enabled order types, in the merchant's order. */
  orderTypes: OrderType[]
  /** Form fields keyed by order type id, each list in the merchant's order. */
  formFieldsByOrderType: Readonly<Record<string, CustomerFormField[]>>
  /** Active payment methods keyed by the order types they are linked to. */
  paymentMethodsByOrderType: Readonly<Record<string, PaymentMethod[]>>
  /**
   * Active branches for a multi-branch tenant. `null` means "not loaded here"
   * — a single-location tenant, or a failed read — and the branch hook then
   * reads them itself, exactly as it did before.
   */
  outlets: Outlet[] | null
  /**
   * The public Messenger page id of the tenant's connected Facebook page, or
   * null when none is connected. Resolved server-side because the browser read
   * it at submit time, and `facebook_pages` is readable by `anon` only — a
   * signed-in visitor's read came back empty and silently skipped the
   * proactive Messenger send.
   */
  facebookPageId: string | null
}

/** A payment method row with its order-type links embedded. */
export interface PaymentMethodWithLinks extends PaymentMethod {
  payment_method_order_types?: ReadonlyArray<{ order_type_id: string | null }> | null
}

const NO_FORM_FIELDS: CustomerFormField[] = []
const NO_PAYMENT_METHODS: PaymentMethod[] = []

/** Groups form fields by order type, keeping each group in the input order. */
export function groupFormFieldsByOrderType(
  fields: readonly CustomerFormField[]
): Record<string, CustomerFormField[]> {
  return fields.reduce<Record<string, CustomerFormField[]>>((groups, field) => {
    const current = groups[field.order_type_id] ?? []
    return { ...groups, [field.order_type_id]: [...current, field] }
  }, {})
}

/**
 * Groups payment methods under every order type they are linked to, keeping the
 * input order. The embedded link rows are dropped: nothing downstream reads
 * them, and they would otherwise ride along in the page payload.
 */
export function groupPaymentMethodsByOrderType(
  rows: readonly PaymentMethodWithLinks[]
): Record<string, PaymentMethod[]> {
  return rows.reduce<Record<string, PaymentMethod[]>>((groups, row) => {
    const { payment_method_order_types: links, ...method } = row
    const orderTypeIds = new Set(
      (links ?? []).map((link) => link.order_type_id).filter((id): id is string => Boolean(id))
    )
    return [...orderTypeIds].reduce(
      (acc, orderTypeId) => ({ ...acc, [orderTypeId]: [...(acc[orderTypeId] ?? []), method] }),
      groups
    )
  }, {})
}

/** The form fields for one order type. Stable empty array when there are none. */
export function formFieldsForOrderType(
  config: Pick<CheckoutConfig, 'formFieldsByOrderType'>,
  orderTypeId: string | null
): CustomerFormField[] {
  if (!orderTypeId) return NO_FORM_FIELDS
  return config.formFieldsByOrderType[orderTypeId] ?? NO_FORM_FIELDS
}

/** The payment methods for one order type. Stable empty array when there are none. */
export function paymentMethodsForOrderType(
  config: Pick<CheckoutConfig, 'paymentMethodsByOrderType'>,
  orderTypeId: string | null
): PaymentMethod[] {
  if (!orderTypeId) return NO_PAYMENT_METHODS
  return config.paymentMethodsByOrderType[orderTypeId] ?? NO_PAYMENT_METHODS
}

/**
 * The customer form for a (new) order type, carrying over whatever the customer
 * already typed into a field of the same name.
 *
 * Switching delivery ↔ pickup used to blank the whole form, so a customer who
 * had filled in their name and phone had to type them again. Values for fields
 * the new order type does not have are dropped, so nothing stale is submitted.
 */
export function carryOverCustomerData(
  fields: readonly CustomerFormField[],
  previous: Readonly<Record<string, string>>
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.field_name, previous[field.field_name] ?? '']))
}

/**
 * Which payment method stays selected when the list changes. A selection the
 * new list does not contain is dropped — an order must never carry a method
 * that is not linked to its order type — and a list of exactly one preselects it.
 */
export function reconcilePaymentSelection(
  methods: readonly PaymentMethod[],
  selectedId: string | null
): string | null {
  if (selectedId && methods.some((method) => method.id === selectedId)) return selectedId
  return methods.length === 1 ? methods[0].id : null
}
