/**
 * The wire carries pesos (the web's unit); every sum the app does runs in
 * integer centavos so 0.1 + 0.2 never reaches a receipt.
 */
export function toCentavos(pesos: number): number {
  return Math.round(pesos * 100)
}

export function fromCentavos(centavos: number): number {
  return centavos / 100
}

const WHOLE = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })
const FRACTIONAL = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** ₱145 for whole pesos, ₱145.50 otherwise — the way a menu board reads. */
export function formatPeso(centavos: number): string {
  const pesos = fromCentavos(centavos)
  const formatter = centavos % 100 === 0 ? WHOLE : FRACTIONAL
  return `₱${formatter.format(pesos)}`
}
