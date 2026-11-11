/**
 * `convex export` writes a zip with `tables/<table>/documents.jsonl` (one JSON
 * document per line) and `_tables/documents.jsonl` (the table list). This
 * turns those texts into a `ConvexSnapshot`; the CLI does the unzipping.
 */
import type { ConvexSnapshot } from './types'

export function parseJsonl<T>(textContent: string): T[] {
  return textContent
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

/** `files`: table name → its documents.jsonl text (missing tables are simply empty). */
export function snapshotFromTables(files: Record<string, string>): ConvexSnapshot {
  const read = <T>(table: string): T[] => (files[table] === undefined ? [] : parseJsonl<T>(files[table]))
  const tableCounts: Record<string, number> = {}
  for (const [table, content] of Object.entries(files)) {
    if (table.startsWith('_')) continue
    tableCounts[table] = parseJsonl(content).length
  }
  return {
    orders: read('orders'),
    orderItems: read('orderItems'),
    orderPayments: read('orderPayments'),
    orderRevisions: read('orderRevisions'),
    productCosts: read('productCosts'),
    tenantConfig: read('tenantConfig'),
    tableCounts,
  }
}

/** Zip entry path → table name, for `tables/<name>/documents.jsonl` (or `<name>/documents.jsonl`). */
export function tableNameFromEntry(entryPath: string): string | null {
  const match = /(?:^|\/)([^/]+)\/documents\.jsonl$/.exec(entryPath)
  return match ? match[1] : null
}
