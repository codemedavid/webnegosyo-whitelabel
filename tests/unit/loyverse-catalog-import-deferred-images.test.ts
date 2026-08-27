/**
 * Image mirroring must not sit on the catalog import's critical path.
 *
 * The live failure this reproduces: the per-item loop awaited a network
 * image mirror for every item, so a 244-item catalog outran the serverless
 * timeout — loyverse_last_synced_at stayed NULL forever and the tail of the
 * catalog never landed ("some items are not syncing"). Items must all be
 * written first (with the Loyverse hotlink as a renderable placeholder),
 * then a capped batch of mirrors runs after; the next sync/reconcile picks
 * up the remainder because a stored hotlink still reads as "mirror me".
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
  private nullColumns: string[] = []
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
  not(column: string, _operator: string, _value: unknown) {
    this.notNullColumns.push(column)
    return this
  }
  is(column: string, value: unknown) {
    if (value === null) this.nullColumns.push(column)
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
    for (const column of this.notNullColumns) {
      if (row[column] === null || row[column] === undefined) return false
    }
    for (const column of this.nullColumns) {
      if (row[column] !== null && row[column] !== undefined) return false
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
      rows.push(...created)
      return { data: this.wantsSingle ? created[0] : created, error: null }
    }
    if (this.op === 'update') {
      for (const row of rows) {
        if (this.matches(row)) Object.assign(row, this.payload)
      }
      return { data: null, error: null }
    }
    this.db.set(
      this.table,
      rows.filter((row) => !this.matches(row))
    )
    return { data: null, error: null }
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown
          error: { message: string } | null
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
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
    return `id-${this.counter}`
  }
  client() {
    return { from: (table: string) => new FakeQuery(this, table) }
  }
}

const db = new FakeDb()

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => db.client(),
}))

// Records, at the moment each mirror starts, how many menu items were already
// written — the whole point is that this equals the full catalog size.
const mirrorCalls: Array<{ url: string; itemsWrittenAtCallTime: number }> = []
let mirrorResult: string | null = 'https://ik.example/mirrored.png'

jest.mock('@/lib/loyverse/image-mirror', () => {
  const actual = jest.requireActual('@/lib/loyverse/image-mirror')
  return {
    shouldMirrorLoyverseImage: actual.shouldMirrorLoyverseImage,
    mirrorLoyverseImage: jest.fn(async (_tenantId: string, url: string) => {
      mirrorCalls.push({ url, itemsWrittenAtCallTime: db.rows('menu_items').length })
      return mirrorResult
    }),
  }
})

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
    image_url: `https://api.loyverse.com/image/${id}.png`,
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

beforeEach(() => {
  db.set('menu_items', [])
  db.set('categories', [])
  db.set('loyverse_item_map', [])
  db.set('tenants', [{ id: 'tenant-1' }])
  mirrorCalls.length = 0
  mirrorResult = 'https://ik.example/mirrored.png'
  catalog.categories = [{ id: 'cat_1', name: 'Coffee' }]
  catalog.items = [
    loyverseItem('item_1', 'Americano'),
    loyverseItem('item_2', 'Latte'),
    loyverseItem('item_3', 'Mocha'),
  ]
  catalog.modifiers = []
  catalog.inventory = []
})

describe('deferred image mirroring', () => {
  it('writes EVERY menu item before mirroring the first image', async () => {
    const report = await importLoyverseCatalog(TENANT)

    expect(report.success).toBe(true)
    expect(menuItems()).toHaveLength(3)
    expect(mirrorCalls.length).toBeGreaterThan(0)
    for (const call of mirrorCalls) {
      expect(call.itemsWrittenAtCallTime).toBe(3)
    }
  })

  it('rewrites mirrored items to the hosted URL and leaves failures on the hotlink', async () => {
    const report = await importLoyverseCatalog(TENANT)

    expect(report.success).toBe(true)
    for (const row of menuItems()) {
      expect(row.image_url).toBe('https://ik.example/mirrored.png')
    }
  })

  it('items keep the renderable Loyverse hotlink when mirroring fails', async () => {
    mirrorResult = null
    const report = await importLoyverseCatalog(TENANT)

    expect(report.success).toBe(true)
    const urls = menuItems().map((row) => row.image_url)
    expect(urls.sort()).toEqual([
      'https://api.loyverse.com/image/item_1.png',
      'https://api.loyverse.com/image/item_2.png',
      'https://api.loyverse.com/image/item_3.png',
    ])
  })

  it('caps mirrors per run; the remainder keeps the hotlink for the next sync to finish', async () => {
    const report = await importLoyverseCatalog(TENANT, { imageMirrorLimit: 2 })

    expect(report.success).toBe(true)
    expect(mirrorCalls).toHaveLength(2)
    const urls = menuItems().map((row) => row.image_url)
    expect(urls.filter((url) => url === 'https://ik.example/mirrored.png')).toHaveLength(2)
    expect(urls.filter((url) => String(url).startsWith('https://api.loyverse.com/'))).toHaveLength(1)
    // The deferral is announced, not silent.
    expect(report.warnings.some((w) => w.includes('deferred'))).toBe(true)
  })

  it('stamps loyverse_last_synced_at even when every mirror fails', async () => {
    mirrorResult = null
    await importLoyverseCatalog(TENANT)

    const tenantRow = db.rows('tenants')[0]
    expect(tenantRow.loyverse_last_synced_at).toEqual(expect.any(String))
  })
})
