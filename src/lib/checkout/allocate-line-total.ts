/**
 * Allocate the total proportionally to the dishes' list value. Each persisted
 * unit price has two decimals and every subtotal is price × quantity. Splitting
 * a quantity row for the leftover centavos preserves both kitchen quantities
 * and the exact combo total (e.g. three dishes sharing a ₱100 combo).
 */
export function allocateLineTotal<T extends { quantity: number; price: number; subtotal: number }>(lines: T[], weights: number[], total: number): T[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map(weight => total * weight / sum)
  const shares = raw.map(Math.floor)
  let remainder = total - shares.reduce((a, b) => a + b, 0)
  const priority = raw.map((value, index) => ({ index, fraction: value - shares[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const { index } of priority) {
    if (remainder-- <= 0) break
    shares[index]++
  }
  return lines.flatMap((line, index) => {
    const unit = Math.floor(shares[index] / line.quantity)
    const higher = shares[index] % line.quantity
    const lower = line.quantity - higher
    const row = (quantity: number, unitCents: number): T => ({
      ...line, quantity, price: unitCents / 100, subtotal: unitCents * quantity / 100,
    })
    return [...(lower ? [row(lower, unit)] : []), ...(higher ? [row(higher, unit + 1)] : [])]
  })
}
