/**
 * Centralized route href builders for the (main) tab tree.
 *
 * These return fully-substituted string paths. expo-router v6 with
 * `typedRoutes` fails to resolve the object href form when a group segment
 * (e.g. `(main)`) is combined with a `[param]` template in `pathname`, landing
 * the user on the built-in "Unmatched Route" screen. String hrefs with the
 * param already interpolated resolve reliably — the same pattern order detail
 * navigation already uses successfully.
 */

/** Sentinel productId that puts the editor screen into create mode. */
export const NEW_PRODUCT_ID = "new" as const;

/**
 * Build the href for the product editor screen.
 *
 * The return type is the template-literal shape that expo-router's generated
 * typed-routes `Href` union exposes for the `product/[productId]` dynamic
 * route, so `router.push`/`router.replace` accept it without a cast.
 *
 * @param productId an existing product id, or {@link NEW_PRODUCT_ID} to create.
 */
export function productHref(productId: string): `/(main)/product/${string}` {
  return `/(main)/product/${encodeURIComponent(productId)}`;
}

/**
 * Build the href for a product's sales performance page, opened on `period`
 * ("today", "yesterday", "7d" or "30d").
 */
export function productPerformanceHref(
  productId: string,
  period: string
): `/(main)/product-performance/${string}` {
  return `/(main)/product-performance/${encodeURIComponent(productId)}?period=${encodeURIComponent(period)}`;
}

/**
 * Build the href for a product's recipe (ingredients) editor.
 *
 * @param productId the menu item whose recipe is being edited.
 */
export function recipeHref(productId: string): `/(main)/product/recipe/${string}` {
  return `/(main)/product/recipe/${encodeURIComponent(productId)}`;
}

/** Sentinel methodId that puts the payment method editor into create mode. */
export const NEW_PAYMENT_METHOD_ID = "new" as const;

/**
 * Build the href for the payment method editor screen.
 *
 * @param methodId an existing method id, or {@link NEW_PAYMENT_METHOD_ID}.
 */
export function paymentMethodHref(methodId: string): `/(main)/payment/${string}` {
  return `/(main)/payment/${encodeURIComponent(methodId)}`;
}

/** Sentinel voucherId that puts the voucher editor into create mode. */
export const NEW_VOUCHER_ID = "new" as const;

/**
 * Build the href for the voucher editor screen.
 *
 * @param voucherId an existing voucher id, or {@link NEW_VOUCHER_ID}.
 */
export function voucherHref(voucherId: string): `/(main)/voucher/${string}` {
  return `/(main)/voucher/${encodeURIComponent(voucherId)}`;
}

/** Sentinel campaignId that puts the SMS campaign editor into create mode. */
export const NEW_CAMPAIGN_ID = "new" as const;

/**
 * Build the href for the SMS follow-up campaign editor.
 *
 * @param campaignId an existing campaign id, or {@link NEW_CAMPAIGN_ID}.
 */
export function campaignHref(campaignId: string): `/(main)/campaign/${string}` {
  return `/(main)/campaign/${encodeURIComponent(campaignId)}`;
}

/** The editor in create mode with a preset already filled in (Reports dashboard moves). */
export function newCampaignFromPresetHref(presetId: string): `/(main)/campaign/${string}` {
  return `/(main)/campaign/${NEW_CAMPAIGN_ID}?preset=${encodeURIComponent(presetId)}`;
}

/** Sentinel categoryId that puts the category editor into create mode. */
export const NEW_CATEGORY_ID = "new" as const;

/**
 * Build the href for the category editor screen.
 *
 * @param categoryId an existing category id, or {@link NEW_CATEGORY_ID}.
 */
export function categoryHref(categoryId: string): `/(main)/category/${string}` {
  return `/(main)/category/${encodeURIComponent(categoryId)}`;
}

/**
 * Build the href for one loyalty member's profile.
 *
 * Keyed by the IDENTITY key (`phone:+63…`), not a customer id: a stamp card
 * can exist before the customer profile row that would name it, and the
 * balance tables are keyed by the phone throughout.
 */
export function loyaltyMemberHref(customerKey: string): `/(main)/loyalty-member/${string}` {
  return `/(main)/loyalty-member/${encodeURIComponent(customerKey)}`;
}

/**
 * Build the href for one guest's profile, opened from the Customers list.
 *
 * Keyed by the `customers` row id, unlike `loyaltyMemberHref`: every guest on
 * the list has a row, but not every one has a phone or a stamp card.
 */
export function customerHref(customerId: string): `/(main)/customer/${string}` {
  return `/(main)/customer/${encodeURIComponent(customerId)}`;
}

/** Sentinel ingredientId that puts the ingredient editor into create mode. */
export const NEW_INGREDIENT_ID = "new" as const;

/**
 * Build the href for one ingredient's page (stock, actions, history).
 *
 * @param ingredientId the `inventory_items` id.
 */
export function ingredientHref(ingredientId: string): `/(main)/ingredient/${string}` {
  return `/(main)/ingredient/${encodeURIComponent(ingredientId)}`;
}

/**
 * Build the href for the ingredient editor.
 *
 * @param ingredientId an existing ingredient id, or {@link NEW_INGREDIENT_ID}.
 */
export function ingredientEditorHref(ingredientId: string): `/(main)/ingredient/edit/${string}` {
  return `/(main)/ingredient/edit/${encodeURIComponent(ingredientId)}`;
}
