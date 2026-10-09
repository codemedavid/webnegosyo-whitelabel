/**
 * Answers to the merchant's own checkout questions on a counter sale
 * ("Landmark", "Preferred time", …) — see `pos-checkout-fields.ts`.
 *
 * Kept per sale in the register store and wiped with every finished or
 * abandoned sale (`clearedSaleAnswers`, the same pattern as the delivery and
 * customer slices), so one customer's landmark never rides on the next sale.
 */

import type { PosCheckoutField } from "./pos-checkout-fields";

/** Answers keyed by the field's `name` (its `customerData` key). */
export type CheckoutAnswers = Readonly<Record<string, string>>;

export interface ClearedSaleAnswers {
  checkoutAnswers: CheckoutAnswers;
}

export function clearedSaleAnswers(): ClearedSaleAnswers {
  return { checkoutAnswers: {} };
}

/** A new answers object with one answer replaced (blank removes it). */
export function withAnswer(answers: CheckoutAnswers, name: string, value: string): CheckoutAnswers {
  const rest = Object.fromEntries(Object.entries(answers).filter(([key]) => key !== name));
  return value === "" ? rest : { ...rest, [name]: value };
}

/**
 * The `customerData` keys these answers write: only questions the CURRENT
 * order type asks (a landmark typed before switching to dine-in is dropped),
 * only non-blank answers. The order builder spreads this FIRST, so a merchant
 * field that happens to be called "pos" or "discount" can never displace the
 * register's own keys.
 */
export function answersCustomerData(
  fields: readonly PosCheckoutField[],
  answers: CheckoutAnswers,
): Record<string, string> {
  return fields.reduce<Record<string, string>>((data, field) => {
    const value = (answers[field.name] ?? "").trim();
    return value === "" ? data : { ...data, [field.name]: value };
  }, {});
}

export function answeredCount(fields: readonly PosCheckoutField[], answers: CheckoutAnswers): number {
  return fields.filter((field) => (answers[field.name] ?? "").trim() !== "").length;
}
