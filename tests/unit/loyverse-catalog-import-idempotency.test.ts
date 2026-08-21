/**
 * Re-running the Loyverse catalog import must never duplicate menu items.
 *
 * The live failure this reproduces: `importLoyverseCatalog` writes the
 * `loyverse_item_map` only AFTER its per-item loop finishes (delete-all then
 * batch-insert). The loop mirrors an image per item, so a large catalog can
 * outrun the serverless timeout — leaving menu_items created but ZERO map
 * rows. Since the map was the only thing linking a Loyverse item to a local
 * row, the merchant's second sync matched nothing and inserted everything a
 * second time.
 *
 * These tests pin the guarantee at the level the merchant experiences it:
 * whatever happened to the map, a second import updates in place.
 */

import type { Tenant } from '@/types/database'
import type {
  LoyverseCatalogCategory,
  LoyverseCatalogItem,
  LoyverseCatalogModifier,
  LoyverseCatalogStockLevel,
} from '@/lib/loyverse/catalog-mapper'

// --- In-memory Supabase double -------------------------------------------
// Mirrors only the query shapes catalog-import actually uses.

type Row = Record<string, unknown>

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private opSet = false
  private filters: Array<[string, unknown]> = []
  private inFilter: [string, unknown[]] | null = null
  private notNullColumns: string[] = []
  private payload: Row | Row[] | null = null
  private wantsSingle = false

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_columns?: string) {
    if (!this.opSet) {
      this.op = 'select'
      this.opSet = true
    }
    return this
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert'
    this.opSet = true
    this.payload = payload
    return this
  }
  update(payload: Row) {
    this.op = 'update'
    this.opSet = true
    this.payload = payload
    return this
  }
  delete() {
    this.op = 'delete'
    this.opSet = true
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value])
    return this
  }
  in(column: string, values: unknown[]) {
    this.inFilter = [column, values]
    return this
  }
  /** Only `.not(col, 'is', null)` is used by catalog-import. */
  not(column: string, _operator: string, _value: unknown) {
    this.notNullColumns.push(column)
    return this
  }
  maybeSingle() {
    this.wantsSingle = true
    return this
  }
  single() {
    this.wantsSingle = true
    return this
  }

  private matches(row: Row): boolean {
    for (const [column, value] of this.filters) {
      if (row[column] !== value) return false
    }
    if (this.inFilter && !this.inFilter[1].includes(row[this.inFilter[0]])) return false
    for (const column of this.notNullColumns) {
      if (row[column] === null || row[column] === undefined) return false
    }
    return true
  }

  private run(): { data: unknown; error: { message: string } | null } {
    const rows = this.db.rows(this.table)
    const failure = this.db.failures[`${this.table}:${this.op}`]
    if (failure) return { data: null, error: { message: failure } }

    if (this.op === 'select') {
      const found = rows.filter((row) => this.matches(row))
      return { data: this.wantsSingle ? (found[0] ?? null) : found, error: null }
    }
    if (this.op === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
      const created: Row[] = incoming.map((row) => ({ id: this.db.nextId(), ...row }))
      // Enforce the partial-unique identity the migration adds, so a test can
      // never "pass" by writing two rows the database would have rejected.
      if (this.table === 'menu_items') {
        for (const row of created) {
          const key = row.loyverse_item_id
          if (!key) continue
          const clash = rows.some(
            (existing) =>
              existing.tenant_id === row.tenant_id && existing.loyverse_item_id === key
          )
          if (clash) {
            return {
              data: null,
              error: { message: 'duplicate key value violates unique constraint' },
            }
          }
        }
      }
      rows.push(...created)
      return { data: this.wantsSingle ? created[0] : created, error: null }
    }
    if (this.op === 'update') {
      for (const row of rows) {
        if (this.matches(row)) Object.assign(row, this.payload)
      }
      return { data: null, error: null }
    }
    // delete
    const kept = rows.filter((row) => !this.matches(row))
    this.db.set(this.table, kept)
    return { data: null, error: null }
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

class FakeDb {
  private tables = new Map<string, Row[]>()
  private counter = 0
  failures: Record<string, string> = {}

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, [])
    return this.tables.get(table) as Row[]
  }
  set(table: string, rows: Row[]) {
    this.tables.set(table, rows)
  }
  nextId(): string {
    this.counter += 1
    return `id-${this.counter}`
  }
  client() {
    return { from: (table: string) => new FakeQuery(this, table) }
  }
}

// --- Module mocks ---------------------------------------------------------

const db = new FakeDb()

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => db.client(),
}))

jest.mock('@/lib/loyverse/image-mirror', () => ({
  shouldMirrorLoyverseImage: () => false,
  mirrorLoyverseImage: jest.fn(),
}))

const catalog: {
  categories: LoyverseCatalogCategory[]
  items: LoyverseCatalogItem[]
  modifiers: LoyverseCatalogModifier[]
  inventory: LoyverseCatalogStockLevel[]
} = { categories: [], items: [], modifiers: [], inventory: [] }

jest.mock('@/lib/loyverse/client', () => ({
  loyverseListAll: jest.fn(async (_token: string, path: string) => {
    if (path === '/categories') return catalog.categories
    if (path === '/items') return catalog.items
    if (path === '/modifiers') return catalog.modifiers
    if (path === '/inventory') return catalog.inventory
    return []
  }),
}))

import { importLoyverseCatalog } from '@/lib/loyverse/catalog-import'

const STORE = 'store_1'

const TENANT = {
  id: 'tenant-1',
  slug: 'cafe',
  loyverse_enabled: true,
  loyverse_access_token: 'token',
  loyverse_store_id: STORE,
  loyverse_payment_type_id: 'pay_1',
} as unknown as Tenant

function loyverseItem(id: string, name: string): LoyverseCatalogItem {
  return {
    id,
    item_name: name,
    category_id: 'cat_1',
    track_stock: false,
    variants: [
      {
        variant_id: `${id}_var`,
        item_id: id,
        default_pricing_type: 'FIXED',
        default_price: 100,
        stores: [{ store_id: STORE, pricing_type: 'FIXED', price: 100 }],
      },
    ],
  }
}

const menuItems = () => db.rows('menu_items')
const mapRows = () => db.rows('loyverse_item_map')

beforeEach(() => {
  db.set('menu_items', [])
  db.set('categories', [])
  db.set('loyverse_item_map', [])
  db.set('tenants', [{ id: 'tenant-1' }])
  db.failures = {}
  catalog.categories = [{ id: 'cat_1', name: 'Coffee' }]
  catalog.items = [loyverseItem('item_1', 'Americano')]
  catalog.modifiers = []
  catalog.inventory = []
})

describe('importLoyverseCatalog — re-sync idempotency', () => {
  it('updates the existing dish instead of creating a second one on a clean re-sync', async () => {
    const first = await importLoyverseCatalog(TENANT)
    expect(first.itemsCreated).toBe(1)
    expect(menuItems()).toHaveLength(1)

    const second = await importLoyverseCatalog(TENANT)

    expect(second.itemsCreated).toBe(0)
    expect(second.itemsUpdated).toBe(1)
    expect(menuItems()).toHaveLength(1)
  })

  it('still matches the existing dish when the item map was lost (interrupted first sync)', async () => {
    await importLoyverseCatalog(TENANT)
    expect(menuItems()).toHaveLength(1)

    // The exact live state after a timeout: dishes exist, map never written.
    db.set('loyverse_item_map', [])

    const second = await importLoyverseCatalog(TENANT)

    expect(second.itemsCreated).toBe(0)
    expect(second.itemsUpdated).toBe(1)
    expect(menuItems()).toHaveLength(1)
  })

  it('records the Loyverse item id on the menu row so identity survives the map', async () => {
    await importLoyverseCatalog(TENANT)

    expect(menuItems()[0]).toMatchObject({ loyverse_item_id: 'item_1' })
  })

  it('does not duplicate the first item when a later sync adds a missing one', async () => {
    await importLoyverseCatalog(TENANT)

    // The merchant's actual flow: an item was missing, so they add it in
    // Loyverse and sync again.
    catalog.items = [loyverseItem('item_1', 'Americano'), loyverseItem('item_2', 'Latte')]
    const second = await importLoyverseCatalog(TENANT)

    expect(second.itemsCreated).toBe(1)
    expect(second.itemsUpdated).toBe(1)
    expect(menuItems()).toHaveLength(2)
    expect(menuItems().map((row) => row.name).sort()).toEqual(['Americano', 'Latte'])
  })

  it('writes map rows for a dish as it goes, not only after every item is done', async () => {
    await importLoyverseCatalog(TENANT)

    // Per-item map writes are what make a half-finished sync recoverable.
    expect(mapRows().length).toBeGreaterThan(0)
    expect(mapRows()[0]).toMatchObject({ tenant_id: 'tenant-1', loyverse_item_id: 'item_1' })
  })

  it('leaves identity intact when the map write fails outright', async () => {
    await importLoyverseCatalog(TENANT)
    db.set('loyverse_item_map', [])
    db.failures['loyverse_item_map:insert'] = 'map write exploded'

    const second = await importLoyverseCatalog(TENANT)
    delete db.failures['loyverse_item_map:insert']

    // The map may be empty, but the menu must not have grown.
    expect(menuItems()).toHaveLength(1)
    expect(second.itemsCreated).toBe(0)
  })
})
