import type { PosStockItem } from './pos-stock';

/** The accepted QR cart and its inventory snapshot must describe the same lines. */
export function qrOrderStockItems(
  items: readonly { menuItemId: string; quantity: number }[],
  customerData: Record<string, unknown>,
): Array<PosStockItem & { addonQuantities?: Record<string, number> }> {
  const fallback = () => items.map(item => ({ menuItemId: item.menuItemId, quantity: item.quantity, optionIds: [], addonIds: [] }));
  const snapshot = customerData._inventory_selections as { version?: unknown; items?: unknown } | undefined;
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.items) || snapshot.items.length !== items.length) return fallback();
  const rows: Array<PosStockItem & { addonQuantities?: Record<string, number> }> = [];
  for (let index = 0; index < items.length; index++) {
    const row = snapshot.items[index];
    const item = items[index];
    if (!row || typeof row !== 'object' || row.menuItemId !== item.menuItemId || row.quantity !== item.quantity) return fallback();
    const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 1000 && value.every(id => typeof id === 'string' && id.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(id));
    if (!ids(row.optionIds) || !ids(row.addonIds)) return fallback();
    if (row.addonQuantities !== undefined && (!row.addonQuantities || typeof row.addonQuantities !== 'object' || Array.isArray(row.addonQuantities)
      || Object.entries(row.addonQuantities).some(([id, quantity]) => !row.addonIds.includes(id) || !Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 99))) return fallback();
    rows.push({ menuItemId: item.menuItemId, quantity: item.quantity, optionIds: row.optionIds, addonIds: row.addonIds,
      ...(row.addonQuantities ? { addonQuantities: row.addonQuantities } : {}) });
  }
  return rows;
}
