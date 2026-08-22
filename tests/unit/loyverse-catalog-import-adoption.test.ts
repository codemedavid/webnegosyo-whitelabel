/**
 * Adopting existing local dishes that have no Loyverse identity yet.
 *
 * The identity column (migration 20260828130000) is backfilled from
 * `loyverse_item_map`. A tenant whose sync never completed has an EMPTY map,
 * so the backfill claims nothing — and every one of its dishes would be
 * re-inserted by the next sync, duplicating the whole catalog a second time.
 *
 * This is not hypothetical: "Anyeong Dante's Minimart" had 422 menu items, 0
 * map rows and `loyverse_last_synced_at` NULL. After the duplicate cleanup its
 * 167 survivors all carried NULL identity.
 *
 * So an unmatched Loyverse item first tries to ADOPT an existing unclaimed
 * dish by name before creating a new one:
 *   - same category and name, if there is exactly one such row;
 *   - otherwise a tenant-wide unique name match, so a dish whose category
 *     drifted is still adopted rather than duplicated;
 *   - a row that already carries a DIFFERENT Loyverse id is never stolen.
 */

import type { Tenant } from '@/types/database'
import type {
  LoyverseCatalogCategory,
  LoyverseCatalogItem,
  LoyverseCatalogModifier,
  LoyverseCatalogStockLevel,
} from '@/lib/loyverse/catalog-mapper'

type Row = Record<string, unknown>

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private opSet = false
  private filters: Array<[string, unknown]> = []
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
    this.filters.push([`__in__${column}`, values])
    return this
  }
  is(column: string, value: unknown) {
    this.filters.push([`__is__${column}`, value])
    return this
  }
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
      if (column.startsWith('__in__')) {
        const col = column.slice(6)
        if (!(value as unknown[]).includes(row[col])) return false
      } else if (column.startsWith('__is__')) {
        const col = column.slice(6)
        if (value === null && row[col] !== null && row[col] !== undefined) return false
      } else if (row[column] !== value) return false
    }
    for (const column of this.notNullColumns) {
      if (row[column] === null || row[column] === undefined) return false
    }
    return true
  }

  private run(): { data: unknown; error: { message: string } | null } {
    const rows = this.db.rows(this.table)
    if (this.op === 'select') {
      const found = rows.filter((row) => this.matches(row))
      return { data: this.wantsSingle ? (found[0] ?? null) : found, error: null }
    }
    if (this.op === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
      const created: Row[] = incoming.map((row) => ({ id: this.db.nextId(), ...row }))
      if (this.table === 'menu_items') {
        for (const row of created) {
          if (!row.loyverse_item_id) continue
          const clash = rows.some(
            (e) => e.tenant_id === row.tenant_id && e.loyverse_item_id === row.loyverse_item_id
          )
          if (clash) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
          }
        }
      }
      rows.push(...created)
      return { data: this.wantsSingle ? created[0] : created, error: null }
    }
    if (this.op === 'update') {
      for (const row of rows) if (this.matches(row)) Object.assign(row, this.payload)
      return { data: null, error: null }
    }
    this.db.set(this.table, rows.filter((row) => !this.matches(row)))
    return { data: null, error: null }
  }

  then<T1 = { data: unknown; error: { message: string } | null }, T2 = never>(
    onfulfilled?:
      | ((v: { data: unknown; error: { message: string } | null }) => T1 | PromiseLike<T1>)
      | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

class FakeDb {
  private tables = new Map<string, Row[]>()
  private counter = 0
  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, [])
    return this.tables.get(table) as Row[]
  }
  set(table: string, rows: Row[]) {
    this.tables.set(table, rows)
  }
  nextId(): string {
    this.counter += 1
    return `new-${this.counter}`
  }
  client() {
    return { from: (table: string) => new FakeQuery(this, table) }
  }
}

const db = new FakeDb()

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client() }))
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
  loyverseListAll: jest.fn(async (_t: string, path: string) => {
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
  slug: 'minimart',
  loyverse_enabled: true,
  loyverse_access_token: 'token',
  loyverse_store_id: STORE,
  loyverse_payment_type_id: 'pay_1',
} as unknown as Tenant

const loyverseItem = (id: string, name: string): LoyverseCatalogItem => ({
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
})

const existingDish = (id: string, name: string, categoryId: string, loyverseItemId: unknown = null) => ({
  id,
  tenant_id: 'tenant-1',
  name,
  category_id: categoryId,
  loyverse_item_id: loyverseItemId,
  image_url: '',
  price: 1,
})

const menuItems = () => db.rows('menu_items')

beforeEach(() => {
  db.set('menu_items', [])
  db.set('categories', [{ id: 'local-cat', tenant_id: 'tenant-1', name: 'Coffee' }])
  db.set('loyverse_item_map', [])
  db.set('tenants', [{ id: 'tenant-1' }])
  catalog.categories = [{ id: 'cat_1', name: 'Coffee' }]
  catalog.items = [loyverseItem('item_1', 'Americano')]
  catalog.modifiers = []
  catalog.inventory = []
})

describe('importLoyverseCatalog — adopting unclaimed local dishes', () => {
  it('adopts an existing dish with the same name instead of creating a second', async () => {
    db.set('menu_items', [existingDish('local-1', 'Americano', 'local-cat')])

    const report = await importLoyverseCatalog(TENANT)

    expect(menuItems()).toHaveLength(1)
    expect(report.itemsCreated).toBe(0)
    expect(menuItems()[0]).toMatchObject({ id: 'local-1', loyverse_item_id: 'item_1' })
  })

  it('matches names case- and whitespace-insensitively', async () => {
    db.set('menu_items', [existingDish('local-1', '  americano ', 'local-cat')])

    await importLoyverseCatalog(TENANT)

    expect(menuItems()).toHaveLength(1)
    expect(menuItems()[0]).toMatchObject({ id: 'local-1', loyverse_item_id: 'item_1' })
  })

  it('adopts across a category change when the name is unique tenant-wide', async () => {
    // The dish drifted into another category locally; still not a new product.
    db.set('menu_items', [existingDish('local-1', 'Americano', 'some-other-cat')])

    await importLoyverseCatalog(TENANT)

    expect(menuItems()).toHaveLength(1)
    expect(menuItems()[0]).toMatchObject({ id: 'local-1', loyverse_item_id: 'item_1' })
  })

  it('never steals a dish already claimed by a different Loyverse item', async () => {
    db.set('menu_items', [existingDish('local-1', 'Americano', 'local-cat', 'item_OTHER')])

    const report = await importLoyverseCatalog(TENANT)

    expect(report.itemsCreated).toBe(1)
    expect(menuItems()).toHaveLength(2)
    expect(menuItems().find((r) => r.id === 'local-1')).toMatchObject({
      loyverse_item_id: 'item_OTHER',
    })
  })

  it('adopts each dish only once when two Loyverse items share a name', async () => {
    // Two distinct Loyverse products called the same thing must not both
    // claim the single local row - that would violate the unique index.
    db.set('menu_items', [existingDish('local-1', 'Americano', 'local-cat')])
    catalog.items = [loyverseItem('item_1', 'Americano'), loyverseItem('item_2', 'Americano')]

    await importLoyverseCatalog(TENANT)

    const claimed = menuItems().filter((r) => r.loyverse_item_id)
    expect(claimed).toHaveLength(2)
    expect(new Set(claimed.map((r) => r.loyverse_item_id)).size).toBe(2)
    expect(menuItems()).toHaveLength(2)
  })

  it('still creates a dish that has no local counterpart', async () => {
    const report = await importLoyverseCatalog(TENANT)

    expect(report.itemsCreated).toBe(1)
    expect(menuItems()).toHaveLength(1)
  })

  it('leaves an adopted dish matched on the following sync', async () => {
    db.set('menu_items', [existingDish('local-1', 'Americano', 'local-cat')])

    await importLoyverseCatalog(TENANT)
    const second = await importLoyverseCatalog(TENANT)

    expect(second.itemsCreated).toBe(0)
    expect(second.itemsUpdated).toBe(1)
    expect(menuItems()).toHaveLength(1)
  })
})
