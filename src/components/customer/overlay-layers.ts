/**
 * Stacking order of the storefront's full-screen overlays. The "Added" sheet
 * opens FROM the item sheet and is portaled to <body>, so it must sit above
 * it: at z-60 under the item sheet's z-100 it opened invisibly, and diners saw
 * only a toast — never the pairings.
 */
export const STOREFRONT_LAYERS = {
  itemSheet: 100,
  addedSheet: 105,
} as const
