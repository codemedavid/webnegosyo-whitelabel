/** `ORDER_<id>` or `ORDER_<id>_<timestamp>` (an m.me link from checkout) → the order id; null for any other ref. */
export function orderIdFromRef(ref: string): string | null {
  if (!ref.startsWith('ORDER_')) return null
  const match = ref.match(/^ORDER_(.+?)(?:_\d+)?$/)
  const orderId = match ? match[1] : ref.replace('ORDER_', '').split('_')[0]
  return orderId || null
}
