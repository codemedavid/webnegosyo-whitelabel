// Shared number/money formatting for the merchant admin app.
//
// Revenue was previously rendered with `₱${n.toFixed(0)}` in ~15 places, which
// dropped centavos and had no thousands separators (₱125000.5 -> "₱125000").
// These helpers give consistent, readable peso amounts across every screen.

const PESO = "₱"; // ₱

/**
 * Format a peso amount with thousands separators.
 * @param amount value in pesos
 * @param decimals number of decimal places (default 2; pass 0 for compact axis labels)
 */
export function formatPeso(amount: number, decimals: number = 2): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return (
    PESO +
    safe.toLocaleString("en-PH", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

/** Compact peso for chart axes: ₱1.2k / ₱3.4M, no decimals under 1000. */
export function formatPesoCompact(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(safe);
  if (abs >= 1_000_000) return PESO + (safe / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return PESO + (safe / 1_000).toFixed(1) + "k";
  return PESO + Math.round(safe).toString();
}

/** Integer with thousands separators (order counts, units, etc.). */
export function formatCount(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("en-PH");
}
