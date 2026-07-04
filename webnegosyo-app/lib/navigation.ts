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
