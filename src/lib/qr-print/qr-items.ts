/**
 * Every code a store can print: one for the store, one per active branch,
 * one per table — the floor plan's tables plus any the merchant typed in
 * without drawing a floor.
 *
 * Pure: the page loads outlets and tables, this decides what each code says
 * and where it points.
 */

import { normalizeTableNumber } from '@/lib/order-table-number'
import { buildQrTargetUrl } from '@/lib/qr-print/qr-links'

export type QrItemKind = 'store' | 'branch' | 'table'

export interface QrItem {
  id: string
  kind: QrItemKind
  title: string | null
  subtitle: string | null
  url: string
  /** Without extension. */
  fileName: string
  /** A table the merchant typed in, not one from the floor plan. */
  isTyped: boolean
}

export interface QrTableGroup {
  /** The outlet id, or `STORE_FLOOR_KEY` for tables on no branch. */
  key: string
  name: string
  items: QrItem[]
}

export interface QrCatalog {
  store: QrItem
  branches: QrItem[]
  tableGroups: QrTableGroup[]
}

export interface QrOutlet {
  id: string
  name: string
  slug: string
  isActive: boolean
}

export interface QrTable {
  id: string
  label: string
  outletId: string | null
  zone: string | null
}

export interface QrExtraTables {
  /** `STORE_FLOOR_KEY` / null for the store's own floor. */
  outletId: string | null
  labels: string[]
}

export interface QrCatalogInput {
  tenantSlug: string
  baseUrl: string
  isMultiBranch: boolean
  outlets: QrOutlet[]
  tables: QrTable[]
  extraTables: QrExtraTables[]
}

export const STORE_FLOOR_KEY = 'store'
const STORE_FLOOR_NAME = 'Main floor'
const NO_BRANCH_NAME = 'No branch'

const NUMBER_LIKE_LABEL = /^[A-Z]{0,2}\d+[A-Z]?$/i

export function tableTitle(label: string): string {
  const clean = label.trim()
  return NUMBER_LIKE_LABEL.test(clean) ? `Table ${clean}` : clean
}

function fileSlug(...parts: string[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const byLabel = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })

interface FloorTable {
  id: string
  label: string
  zone: string | null
  isTyped: boolean
}

function tableItem(input: QrCatalogInput, outlet: QrOutlet | null, table: FloorTable): QrItem {
  const subtitle = [outlet?.name ?? null, table.zone].filter((part): part is string => !!part).join(' · ')
  return {
    id: `table:${table.id}`,
    kind: 'table',
    title: tableTitle(table.label),
    subtitle: subtitle || null,
    url: buildQrTargetUrl(input.baseUrl, { tableLabel: table.label, outletSlug: outlet?.slug ?? null }),
    fileName: fileSlug(input.tenantSlug, outlet?.slug ?? '', 'table', table.label, 'qr'),
    isTyped: table.isTyped,
  }
}

function buildTableGroups(input: QrCatalogInput): QrTableGroup[] {
  const outletsById = new Map(input.outlets.map((outlet) => [outlet.id, outlet]))
  // A table only names a branch when the store runs branches.
  const groupKey = (outletId: string | null) =>
    input.isMultiBranch && outletId && outletsById.has(outletId) ? outletId : STORE_FLOOR_KEY

  const floors = new Map<string, FloorTable[]>()
  const add = (key: string, table: FloorTable) => floors.set(key, [...(floors.get(key) ?? []), table])

  for (const table of input.tables) {
    add(groupKey(table.outletId), { id: table.id, label: table.label, zone: table.zone, isTyped: false })
  }

  for (const extra of input.extraTables) {
    const isStoreFloor = extra.outletId === null || extra.outletId === STORE_FLOOR_KEY
    if (!isStoreFloor && !outletsById.has(extra.outletId!)) continue
    const key = isStoreFloor ? STORE_FLOOR_KEY : groupKey(extra.outletId)
    const known = new Set((floors.get(key) ?? []).map((t) => normalizeTableNumber(t.label)))
    for (const label of extra.labels) {
      const normalized = normalizeTableNumber(label)
      if (normalized === '' || known.has(normalized)) continue
      known.add(normalized)
      add(key, { id: `typed:${key}:${normalized}`, label, zone: null, isTyped: true })
    }
  }

  // Branch order follows the outlet list (the merchant's own sort order);
  // the store's floor comes first.
  const orderedKeys = [STORE_FLOOR_KEY, ...input.outlets.map((outlet) => outlet.id)]
  return orderedKeys
    .filter((key) => floors.has(key))
    .map((key) => {
      const outlet = key === STORE_FLOOR_KEY ? null : outletsById.get(key)!
      const name = outlet ? outlet.name : input.isMultiBranch ? NO_BRANCH_NAME : STORE_FLOOR_NAME
      return {
        key,
        name,
        items: [...floors.get(key)!].sort(byLabel).map((table) => tableItem(input, outlet, table)),
      }
    })
}

export function buildQrCatalog(input: QrCatalogInput): QrCatalog {
  const store: QrItem = {
    id: 'store',
    kind: 'store',
    title: null,
    subtitle: null,
    url: buildQrTargetUrl(input.baseUrl, {}),
    fileName: fileSlug(input.tenantSlug, 'menu', 'qr'),
    isTyped: false,
  }

  const branches: QrItem[] = input.isMultiBranch
    ? input.outlets
        .filter((outlet) => outlet.isActive)
        .map((outlet) => ({
          id: `branch:${outlet.id}`,
          kind: 'branch' as const,
          title: outlet.name,
          subtitle: null,
          url: buildQrTargetUrl(input.baseUrl, { outletSlug: outlet.slug }),
          fileName: fileSlug(input.tenantSlug, outlet.slug, 'qr'),
          isTyped: false,
        }))
    : []

  return { store, branches, tableGroups: buildTableGroups(input) }
}
