/**
 * What happens the moment a menu item is saved.
 *
 * Creating a dish used to end by silently closing back to the menu list. On a
 * tenant with inventory on that was the moment the recipe step was lost: a
 * dish with no recipe deducts nothing when it sells, and the editor for it sat
 * unreachable at the bottom of a form the merchant had just left. The live
 * platform proved the cost — inventory switched on, zero recipes anywhere.
 *
 * Pure, so the decision is testable without mounting the form.
 */

export interface PostSaveContext {
  /** True when the save CREATED the item; edits already show the recipe editor. */
  isNewItem: boolean
  inventoryEnabled: boolean
  /** The saved item's id, when the server returned one. */
  savedItemId: string | undefined
}

export type PostSaveStep =
  | { kind: 'link-ingredients'; itemId: string }
  | { kind: 'return-to-menu' }

/**
 * Where the form goes after a successful save.
 *
 * Only a brand-new dish on an inventory tenant is walked into the recipe step:
 * an edited dish had the editor on screen the whole time, and a tenant without
 * inventory has nothing to link.
 */
export function resolvePostSaveStep(context: PostSaveContext): PostSaveStep {
  const shouldLink = context.isNewItem && context.inventoryEnabled && Boolean(context.savedItemId)
  if (shouldLink && context.savedItemId) {
    return { kind: 'link-ingredients', itemId: context.savedItemId }
  }
  return { kind: 'return-to-menu' }
}
