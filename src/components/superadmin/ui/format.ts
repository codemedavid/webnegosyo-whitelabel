// Shared formatters for the superadmin surfaces. Platform currency is PHP (₱).

export function formatCurrency(value: number, opts?: { decimals?: boolean }): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: opts?.decimals ? 2 : 0,
    maximumFractionDigits: opts?.decimals ? 2 : 0,
  }).format(value || 0)
}

/** Compact money, e.g. ₱1.7K, ₱2.4M */
export function formatCurrencyCompact(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value || 0)
}

/** Compact count, e.g. 1.7K, 12.4K */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0)
}

export function formatPercent(fraction: number, decimals = 0): string {
  return `${(fraction * 100).toFixed(decimals)}%`
}

/** Signed delta for trend pills, e.g. "+12.4%", "−8%". null → "New". */
export function formatDelta(pct: number | null): string {
  if (pct == null) return 'New'
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
  return `${sign}${Math.abs(pct).toFixed(pct % 1 === 0 ? 0 : 1)}%`
}
