/**
 * Split an order's lines into loose items and the bundles they came in, for
 * the order detail screen. Pure and non-mutating: the lines arrive from the
 * query cache and must not be pushed into or summed on in place.
 */

export interface BundleOrderItem {
  menuItemId?: string;
  menuItemName: string;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string; priceAdjustment: number }[];
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  quantity: number;
  subtotal: number;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

export interface BundleGroup<T extends BundleOrderItem = BundleOrderItem> {
  bundleId: string;
  bundleName: string;
  items: T[];
  total: number;
}

export interface GroupedOrderItems<T extends BundleOrderItem = BundleOrderItem> {
  regularItems: T[];
  bundles: BundleGroup<T>[];
}

const DEFAULT_BUNDLE_NAME = "Bundle";

export function groupBundleItems<T extends BundleOrderItem>(items: readonly T[]): GroupedOrderItems<T> {
  const regularItems: T[] = [];
  const bundleOrder: string[] = [];
  const itemsByBundle = new Map<string, T[]>();
  const nameByBundle = new Map<string, string>();

  for (const item of items) {
    if (!item.isBundleItem || !item.bundleId) {
      regularItems.push(item);
      continue;
    }
    const grouped = itemsByBundle.get(item.bundleId);
    if (grouped) {
      grouped.push(item);
    } else {
      bundleOrder.push(item.bundleId);
      itemsByBundle.set(item.bundleId, [item]);
      nameByBundle.set(item.bundleId, item.bundleName ?? DEFAULT_BUNDLE_NAME);
    }
  }

  const bundles = bundleOrder.map((bundleId) => {
    const grouped = itemsByBundle.get(bundleId) ?? [];
    return {
      bundleId,
      bundleName: nameByBundle.get(bundleId) ?? DEFAULT_BUNDLE_NAME,
      items: grouped,
      total: grouped.reduce((sum, item) => sum + item.subtotal, 0),
    };
  });

  return { regularItems, bundles };
}
