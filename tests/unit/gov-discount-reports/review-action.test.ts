/** @jest-environment node */

import { reviewInputSchema } from '@/lib/gov-discount-reports/review-schema'

const TENANT = '11111111-1111-4111-8111-111111111111'
const CLAIM = '22222222-2222-4222-8222-222222222222'

const mockVerify = jest.fn()
const mockRevalidate = jest.fn()
const mockInsert = jest.fn()
let claimRow: { id: string } | null
let insertResult: { data: { id: string } | null; error: { message: string } | null }

jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => mockVerify(...args),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => mockRevalidate(...args) }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'gov_discount_claims') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: claimRow, error: null }),
        }
        return chain
      }
      return {
        insert: (row: unknown) => {
          mockInsert(row)
          return { select: () => ({ maybeSingle: async () => insertResult }) }
        },
      }
    },
  }),
}))

async function act(input: Record<string, unknown>) {
  const { reviewGovDiscountAction } = await import('@/app/actions/gov-discount-review')
  return reviewGovDiscountAction({ tenantId: TENANT, tenantSlug: 'kape', claimId: CLAIM, verdict: 'ok', ...input } as never)
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockVerify.mockResolvedValue(undefined)
  claimRow = { id: CLAIM }
  insertResult = { data: { id: 'review-1' }, error: null }
})

afterEach(() => jest.restoreAllMocks())

describe('reviewInputSchema', () => {
  it('requires a note for a problem and trims it', () => {
    expect(reviewInputSchema.safeParse({ tenantId: TENANT, tenantSlug: 'kape', claimId: CLAIM, verdict: 'problem', note: '  ' }).success).toBe(false)
    const parsed = reviewInputSchema.parse({ tenantId: TENANT, tenantSlug: 'kape', claimId: CLAIM, verdict: 'problem', note: ' Same ID twice ' })
    expect(parsed.note).toBe('Same ID twice')
  })

  it('stores no note for OK when none was written, and refuses junk', () => {
    expect(reviewInputSchema.parse({ tenantId: TENANT, tenantSlug: 'kape', claimId: CLAIM, verdict: 'ok', note: '' }).note).toBeNull()
    expect(reviewInputSchema.safeParse({ tenantId: TENANT, tenantSlug: 'kape', claimId: CLAIM, verdict: 'approve' }).success).toBe(false)
    expect(reviewInputSchema.safeParse({ tenantId: TENANT, tenantSlug: '../etc', claimId: CLAIM, verdict: 'ok' }).success).toBe(false)
    expect(reviewInputSchema.safeParse({ tenantId: TENANT, tenantSlug: 'kape', claimId: CLAIM, verdict: 'ok', note: 'x'.repeat(501) }).success).toBe(false)
  })
})

describe('reviewGovDiscountAction', () => {
  it('checks discount_review for the store, inserts with the caller’s session and revalidates the page', async () => {
    const result = await act({ verdict: 'problem', note: 'Check with Ana' })

    expect(result).toEqual({ success: true })
    expect(mockVerify).toHaveBeenCalledWith(TENANT, 'discount_review', 'edit')
    expect(mockInsert).toHaveBeenCalledWith({ tenant_id: TENANT, claim_id: CLAIM, verdict: 'problem', note: 'Check with Ana' })
    expect(mockRevalidate).toHaveBeenCalledWith('/kape/admin/gov-discounts')
  })

  it('never sends a reviewer id or name — the database stamps it', async () => {
    await act({ reviewer_user_id: 'someone-else', reviewerName: 'Owner' })
    expect(mockInsert.mock.calls[0][0]).toEqual({ tenant_id: TENANT, claim_id: CLAIM, verdict: 'ok', note: null })
  })

  it('refuses a caller without the permission before touching the database', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
    const result = await act({})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/owners and managers/)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('refuses a claim the caller cannot read (another branch, another store)', async () => {
    claimRow = null
    const result = await act({})
    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('treats an insert that returns no row as a refusal, not a success', async () => {
    insertResult = { data: null, error: null }
    const result = await act({})
    expect(result.success).toBe(false)
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('reports invalid input without calling anything', async () => {
    const result = await act({ verdict: 'problem', note: '' })
    expect(result.success).toBe(false)
    expect(mockVerify).not.toHaveBeenCalled()
  })
})
