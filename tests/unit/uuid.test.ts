import { isUuid } from '@/lib/uuid'

describe('isUuid', () => {
  it('accepts a platform order id', () => {
    expect(isUuid('af2da20a-3a34-4ecd-be08-c066f9abd18f')).toBe(true)
    expect(isUuid('AF2DA20A-3A34-4ECD-BE08-C066F9ABD18F')).toBe(true)
  })

  it('rejects a Convex document id, which Postgres refuses as a uuid', () => {
    expect(isUuid('js71q9w4ja9g3ryvap69b9xxms8e3fzs')).toBe(false)
  })

  it('rejects non-strings and blanks', () => {
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(null)).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(42)).toBe(false)
  })
})
