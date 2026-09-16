/**
 * One write for the whole panel, run when the dish is saved.
 *
 * This replaced four chatty actions (one save per date, one per stepper
 * click, one delete, one reload). Each of those revalidated the route the
 * merchant was standing on, which is what re-rendered the editor mid-edit.
 */

export {}

const verifyTenantPermission = jest.fn()
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (tenantId: string, permission: string) => verifyTenantPermission(tenantId, permission),
}))

const revalidatePath = jest.fn()
jest.mock('next/cache', () => ({
  revalidatePath: (path: string, type?: string) => revalidatePath(path, type),
}))

const createAdminClient = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }))

const TENANT = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'

interface Capture {
  upserted: Record<string, unknown>[] | null
  deleted: string[]
  soldByDate: Record<string, number>
  upsertError: string | null
}

/**
 * A Supabase double shaped like the calls the action makes: one `upsert` for
 * the offered dates, and a `select` then `delete` per removed date.
 */
function stubSupabase(capture: Capture) {
  const rowFor = (payload: Record<string, unknown>) => ({
    id: String(payload.presell_date),
    tenant_id: TENANT,
    menu_item_id: ITEM,
    presell_date: payload.presell_date,
    stock_qty: payload.stock_qty,
    sold_qty: capture.soldByDate[String(payload.presell_date)] ?? 0,
    created_at: '',
    updated_at: '',
  })

  return {
    from: () => {
      const filters: Record<string, string> = {}
      const builder: Record<string, unknown> = {
        upsert(payload: Record<string, unknown>[]) {
          capture.upserted = payload
          return {
            select: () =>
              capture.upsertError
                ? Promise.resolve({ data: null, error: { message: capture.upsertError } })
                : Promise.resolve({ data: payload.map(rowFor), error: null }),
          }
        },
        select: () => builder,
        delete() {
          builder.__deleting = true
          return builder
        },
        eq(column: string, value: string) {
          filters[column] = value
          if (builder.__deleting && column === 'presell_date') capture.deleted.push(value)
          return builder
        },
        in(_column: string, values: string[]) {
          return Promise.resolve({
            data: values
              .filter((date) => (capture.soldByDate[date] ?? 0) > 0)
              .map((date) => ({ presell_date: date, sold_qty: capture.soldByDate[date] })),
            error: null,
          })
        },
        then(resolve: (value: { error: null }) => unknown) {
          return Promise.resolve({ error: null }).then(resolve)
        },
      }
      return builder
    },
  }
}

function freshCapture(soldByDate: Record<string, number> = {}): Capture {
  return { upserted: null, deleted: [], soldByDate, upsertError: null }
}

/**
 * Imported inside each test, not at the top: `next/jest`'s SWC transform
 * leaves static imports ahead of `jest.mock`, so a top-level import would
 * bind the real modules.
 */
const loadSyncAction = async () =>
  (await import('@/app/actions/presell')).syncPresellAllocationsAction

beforeEach(() => {
  jest.clearAllMocks()
  jest.resetModules()
  verifyTenantPermission.mockResolvedValue(undefined)
})

describe('syncPresellAllocationsAction', () => {
  it('writes every offered date in one upsert', async () => {
    // Arrange
    const capture = freshCapture()
    createAdminClient.mockReturnValue(stubSupabase(capture))
    const sync = await loadSyncAction()

    // Act
    const result = await sync(TENANT, 'cafe', {
      menuItemId: ITEM,
      upserts: [
        { presellDate: '2026-12-20', stockQty: 20 },
        { presellDate: '2026-12-21', stockQty: 5 },
      ],
      deletes: [],
    })

    // Assert
    expect(result.success).toBe(true)
    expect(capture.upserted).toHaveLength(2)
    expect(capture.upserted?.[0]).toMatchObject({ presell_date: '2026-12-20', stock_qty: 20 })
  })

  it('returns the stored rows so the editor can show what landed', async () => {
    // Arrange
    createAdminClient.mockReturnValue(stubSupabase(freshCapture({ '2026-12-20': 3 })))
    const sync = await loadSyncAction()

    // Act
    const result = await sync(TENANT, 'cafe', {
      menuItemId: ITEM,
      upserts: [{ presellDate: '2026-12-20', stockQty: 20 }],
      deletes: [],
    })

    // Assert
    expect(result.data).toEqual([expect.objectContaining({ presell_date: '2026-12-20', sold_qty: 3 })])
  })

  it('removes the dates the merchant dropped', async () => {
    // Arrange
    const capture = freshCapture()
    createAdminClient.mockReturnValue(stubSupabase(capture))
    const sync = await loadSyncAction()

    // Act
    const result = await sync(TENANT, 'cafe', {
      menuItemId: ITEM,
      upserts: [],
      deletes: ['2026-12-24'],
    })

    // Assert
    expect(result.success).toBe(true)
    expect(capture.deleted).toEqual(['2026-12-24'])
  })

  it('refuses to delete a date that already has orders, and writes nothing', async () => {
    // Arrange
    const capture = freshCapture({ '2026-12-24': 6 })
    createAdminClient.mockReturnValue(stubSupabase(capture))
    const sync = await loadSyncAction()

    // Act
    const result = await sync(TENANT, 'cafe', {
      menuItemId: ITEM,
      upserts: [{ presellDate: '2026-12-20', stockQty: 20 }],
      deletes: ['2026-12-24'],
    })

    // Assert — the offer must not land either, or the merchant is told it
    // failed while half of it silently went through.
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/already has orders/i)
    expect(capture.upserted).toBeNull()
    expect(capture.deleted).toEqual([])
  })

  it('does nothing at all when the draft is unchanged', async () => {
    // Arrange
    const capture = freshCapture()
    createAdminClient.mockReturnValue(stubSupabase(capture))
    const sync = await loadSyncAction()

    // Act
    const result = await sync(TENANT, 'cafe', { menuItemId: ITEM, upserts: [], deletes: [] })

    // Assert
    expect(result).toEqual({ success: true, data: [] })
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('never revalidates the editor route the merchant is standing on', async () => {
    // Arrange
    createAdminClient.mockReturnValue(stubSupabase(freshCapture()))
    const sync = await loadSyncAction()

    // Act
    await sync(TENANT, 'cafe', {
      menuItemId: ITEM,
      upserts: [{ presellDate: '2026-12-20', stockQty: 20 }],
      deletes: [],
    })

    // Assert — revalidating the current route makes the router re-render the
    // whole edit page after the write, which is the "refresh" merchants saw.
    const paths = revalidatePath.mock.calls.map((call) => call[0])
    expect(paths).not.toContain(`/cafe/admin/menu/${ITEM}`)
    expect(paths).toContain('/cafe/menu')
  })

  it('refuses a caller without menu permission before touching the database', async () => {
    // Arrange
    const capture = freshCapture()
    createAdminClient.mockReturnValue(stubSupabase(capture))
    verifyTenantPermission.mockRejectedValue(new Error('Forbidden'))
    const sync = await loadSyncAction()

    // Act
    const result = await sync(TENANT, 'cafe', {
      menuItemId: ITEM,
      upserts: [{ presellDate: '2026-12-20', stockQty: 20 }],
      deletes: [],
    })

    // Assert
    expect(result).toEqual({ success: false, error: 'Forbidden' })
    expect(capture.upserted).toBeNull()
  })

  it('reports a bad date instead of writing it', async () => {
    // Arrange
    const capture = freshCapture()
    createAdminClient.mockReturnValue(stubSupabase(capture))
    const sync = await loadSyncAction()

    // Act
    const result = await sync(TENANT, 'cafe', {
      menuItemId: ITEM,
      upserts: [{ presellDate: '20 Dec', stockQty: 20 }],
      deletes: [],
    })

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/YYYY-MM-DD/)
    expect(capture.upserted).toBeNull()
  })

  it('surfaces a write failure rather than reporting success', async () => {
    // Arrange
    const capture = freshCapture()
    capture.upsertError = 'duplicate key'
    createAdminClient.mockReturnValue(stubSupabase(capture))
    const sync = await loadSyncAction()

    // Act
    const result = await sync(TENANT, 'cafe', {
      menuItemId: ITEM,
      upserts: [{ presellDate: '2026-12-20', stockQty: 20 }],
      deletes: [],
    })

    // Assert
    expect(result).toEqual({ success: false, error: 'duplicate key' })
  })
})
