/**
 * Rows for the wizard's live phone preview, read from what the owner typed so
 * far. Only a preview: the real menu is read by the AI parser during the
 * build. Pure, so the line shapes it understands are pinned by tests.
 */

export interface PreviewMenuRow {
  name: string
  price: string | null
  isBestSeller: boolean
}

const DEFAULT_MAX_ROWS = 6
/** "Chicken Adobo – 150", "Pancit: ₱120", "Halo-halo P95.50". */
const PRICED_LINE = /^(.*?)[\s\-–—:.·]*(?:₱|PHP|Php|P)?\s*(\d{1,6}(?:\.\d{1,2})?)\s*$/

function parseLine(line: string): { name: string; price: string | null } | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const match = PRICED_LINE.exec(trimmed)
  const name = match?.[1]?.trim()
  return match && name ? { name, price: match[2] } : { name: trimmed, price: null }
}

const fold = (value: string) => value.trim().toLowerCase()

export function previewMenuRows(menuText: string, bestSellers: readonly string[], maxRows = DEFAULT_MAX_ROWS): PreviewMenuRow[] {
  const typed = menuText.split('\n').flatMap((line) => {
    const parsed = parseLine(line)
    return parsed ? [parsed] : []
  })
  const priceOf = (name: string) => typed.find((row) => fold(row.name).includes(fold(name)))?.price ?? null

  const featured = bestSellers
    .filter((name) => name.trim())
    .map((name) => ({ name: name.trim(), price: priceOf(name), isBestSeller: true }))
  const featuredNames = new Set(featured.map((row) => fold(row.name)))
  const rest = typed
    .filter((row) => !featuredNames.has(fold(row.name)) && !featured.some((f) => fold(row.name).includes(fold(f.name))))
    .map((row) => ({ ...row, isBestSeller: false }))

  return [...featured, ...rest].slice(0, maxRows)
}
