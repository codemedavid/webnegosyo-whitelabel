import { targetElementId, type InStoreLinkTarget } from '@/lib/hero-builder/link-target'

export type StoreLinkPlan<Item> =
  | { kind: 'scroll-menu' }
  | { kind: 'scroll-to'; elementId: string }
  /** The layout shows one category at a time: switch to it, then scroll. */
  | { kind: 'show-category'; categoryId: string }
  | { kind: 'open-product'; item: Item }
  | { kind: 'missing-product' }
  | { kind: 'ignore' }

interface StoreLinkContext<Item> {
  hasElement: (id: string) => boolean
  /** Categories on the menu right now (incl. the virtual bundles one). */
  categoryIds: readonly string[]
  /** Products on the menu right now — the branch's menu when one is chosen. */
  items: readonly Item[]
}

/** Decide what an in-store hero link does on this storefront, right now. */
export function planStoreLink<Item extends { id: string }>(
  target: InStoreLinkTarget,
  context: StoreLinkContext<Item>,
): StoreLinkPlan<Item> {
  switch (target.type) {
    case 'menu':
      return { kind: 'scroll-menu' }
    case 'category': {
      const elementId = targetElementId(target)
      if (elementId && context.hasElement(elementId)) return { kind: 'scroll-to', elementId }
      if (!context.categoryIds.includes(target.categoryId)) return { kind: 'scroll-menu' }
      return { kind: 'show-category', categoryId: target.categoryId }
    }
    case 'product': {
      const item = context.items.find((candidate) => candidate.id === target.itemId)
      return item ? { kind: 'open-product', item } : { kind: 'missing-product' }
    }
    case 'anchor':
      return context.hasElement(target.anchor) ? { kind: 'scroll-to', elementId: target.anchor } : { kind: 'ignore' }
  }
}
