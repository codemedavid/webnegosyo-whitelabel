/**
 * Capturing a guest's permission to be texted.
 *
 * A port of `src/lib/sms-consent.ts` — this Expo app cannot import from the
 * web app's `src/`, so the logic is duplicated the same way `cart-utils` and
 * `branding-utils` are. Keep the two in step: the merchant app reads whatever
 * either one writes, and a divergence here shows up as customers who look
 * consented but are silently skipped.
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
