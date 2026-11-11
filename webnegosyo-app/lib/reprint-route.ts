/**
 * Where "Reprint" on a list row goes: the order screen, which prints once the
 * order and its ledger have loaded (so the copy says what was paid) — the list
 * rows carry no items to print from.
 */
export function reprintOrderHref(orderId: string): string {
  return `/(main)/order/${encodeURIComponent(orderId)}?intent=reprint`;
}
