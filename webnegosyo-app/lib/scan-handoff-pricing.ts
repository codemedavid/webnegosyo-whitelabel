import { getAccessTokenBounded } from './authorized-post';
import { getWebAppUrl } from './web-app-url';
import { withDeadline } from './offline/deadline';
import type { QrOrderItemV1 } from './qr-order-codec';

export function handoffPricingLines(items: readonly QrOrderItemV1[]) {
  return items.map((item) => ({
    menu_item_id: item.menuItemId,
    menu_item_name: item.menuItemName,
    quantity: item.quantity,
    price: item.price,
    subtotal: item.subtotal,
    variation: item.variation ?? item.variationSelections?.map(option => option.optionName).join(', '),
    addons: (item.addons ?? []).map(addon => (addon.quantity ?? 1) > 1 ? `${addon.name} ×${addon.quantity}` : addon.name),
    option_ids: item.optionIds,
    addon_ids: item.addonIds,
    addon_quantities: item.addonQuantities,
    isBundleItem: item.isBundleItem,
    bundleId: item.bundleId,
    bundleName: item.bundleName,
    slotName: item.slotName,
    bundleCartId: item.bundleCartId,
    bundleSlotId: item.bundleSlotId,
    bundleQuantity: item.bundleQuantity,
  }));
}

interface PricedLine {
  sourceIndex: number;
  menu_item_name: string;
  quantity: number;
  price: number;
  subtotal: number;
  bundleName?: string;
  slotName?: string;
}

export function applyHandoffPrices(items: readonly QrOrderItemV1[], lines: readonly PricedLine[]): QrOrderItemV1[] {
  return lines.map(line => {
    const source = items[line.sourceIndex];
    if (!source) throw new Error('Could not read verified cart prices. Please scan again.');
    return {
      ...source, menuItemName: line.menu_item_name, quantity: line.quantity,
      price: line.price, subtotal: line.subtotal,
      ...(line.bundleName ? { bundleName: line.bundleName } : {}),
      ...(line.slotName ? { slotName: line.slotName } : {}),
    };
  });
}

/** Keep combo discounts only after the server verifies their membership and price. */
export async function priceComboHandoff(tenantId: string, items: readonly QrOrderItemV1[], outletId: string | null) {
  const controller = new AbortController();
  try {
    return await withDeadline((async () => {
      const token = await getAccessTokenBounded(8000);
      if (!token) throw new Error('Please sign in again to verify this cart.');
      const response = await fetch(`${getWebAppUrl()}/api/orders/price-handoff`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId, outletId, items: handoffPricingLines(items) }),
      });
      const body = await response.json() as { error?: string; lines?: PricedLine[]; total?: number };
      if (!response.ok || !body.lines?.length || !Number.isFinite(body.total)) {
        throw new Error(body.error ?? 'Could not verify this cart. Please scan again.');
      }
      const priced = applyHandoffPrices(items, body.lines);
      return {
        ok: true as const, items: priced, total: body.total!,
        pricesUpdated: Math.abs(priced.reduce((sum, item) => sum + item.subtotal, 0) - items.reduce((sum, item) => sum + item.subtotal, 0)) >= 0.01,
      };
    })(), 15000);
  } finally {
    controller.abort();
  }
}
