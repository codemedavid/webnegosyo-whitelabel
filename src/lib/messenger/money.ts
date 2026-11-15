/**
 * "₱518" / "₱517.50" from integer centavos: centavos only when there are some.
 * The chat-order summary and the staff quick actions print money this way.
 * Pure and browser-safe.
 */
export function formatCentavos(centavos: number): string {
  const pesos = Math.round(centavos) / 100
  const text = Number.isInteger(pesos)
    ? pesos.toLocaleString('en-PH')
    : pesos.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `₱${text}`
}

/**
 * An order whose money is in: `paid`, or `verified` (staff checked the
 * customer's proof). `pending` / `failed` still owe.
 */
export function isPaidStatus(status: string | null | undefined): boolean {
  return status === 'paid' || status === 'verified'
}
