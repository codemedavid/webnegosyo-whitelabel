/**
 * Capturing a guest's permission to be texted.
 *
 * This is the write side of a read path that already existed and had nothing
 * feeding it. `customers.sms_consent` has been in the schema since
 * `20260706120000`, `customers-service.ts` reads `customer_data.sms_consent`
 * when it rolls an order into a profile, and `customer-external-orders.ts` does
 * the same for Convex-backed tenants — but nothing in the codebase ever wrote
 * the field. Every one of the platform's customer rows therefore carries
 * `sms_consent = false`, and the merchant app's audience selection correctly
 * returns nobody.
 *
 * The one detail that matters: consent must be stored as a real boolean.
 * Checkout form values are `Record<string, string>`, so the obvious thing —
 * letting the checkbox flow through the normal form-field path — would store
 * the string `"true"`. Both read sites compare with `=== true`, so a
 * string-typed consent is silently ignored and the guest never becomes
 * reachable despite having ticked the box.
 */

/** The key both read paths look for inside `orders.customer_data`. */
export const SMS_CONSENT_KEY = 'sms_consent' as const

/** A checkout's customer data, before the boolean consent flag is folded in. */
export type CustomerDataInput = Record<string, unknown>

/**
 * Fold an explicit consent answer into the customer data an order carries.
 *
 * `isOptedIn === false` is recorded rather than omitted: absent and false read
 * identically to the aggregate, but only one of them is evidence the guest was
 * actually asked — which is the record that matters under the Data Privacy Act
 * if a complaint ever arrives.
 */
export function withSmsConsent(
  customerData: CustomerDataInput,
  isOptedIn: boolean,
  now: string
): Record<string, unknown> {
  return {
    ...customerData,
    [SMS_CONSENT_KEY]: isOptedIn,
    sms_consent_at: isOptedIn ? now : null,
  }
}

/**
 * Whether a customer-data blob carries genuine consent.
 *
 * Fails closed on anything that is not exactly `true`, including the string
 * `"true"` — permission to text a stranger should never be inferred from a
 * loosely-typed value.
 */
export function hasSmsConsent(customerData: unknown): boolean {
  if (typeof customerData !== 'object' || customerData === null || Array.isArray(customerData)) {
    return false
  }
  return (customerData as Record<string, unknown>)[SMS_CONSENT_KEY] === true
}
