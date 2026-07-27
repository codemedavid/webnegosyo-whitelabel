import { describe, it, expect } from '@jest/globals'
import {
  isMultiBranchEnabled,
  shouldPromptOutletSelection,
  type MultiBranchTenantFields,
} from '@/lib/outlets/multi-branch-flag'

/**
 * The flag is the entire safety story for this feature: every existing tenant
 * row predates the column, so an absent value must read as OFF, and a tenant
 * that turns it on without configuring branches must keep behaving exactly as
 * it does today. These tests are the guard on both.
 */

const outlet = (id: string, isActive = true) => ({ id, is_active: isActive })

describe('isMultiBranchEnabled', () => {
  it('is false when the column is missing (existing tenant rows)', () => {
    expect(isMultiBranchEnabled({})).toBe(false)
  })

  it('is false when the column is null', () => {
    expect(isMultiBranchEnabled({ multi_branch_enabled: null })).toBe(false)
  })

  it('is false when the column is undefined', () => {
    expect(isMultiBranchEnabled({ multi_branch_enabled: undefined })).toBe(false)
  })

  it('is false for a null tenant', () => {
    expect(isMultiBranchEnabled(null)).toBe(false)
  })

  it('is false when explicitly disabled', () => {
    expect(isMultiBranchEnabled({ multi_branch_enabled: false })).toBe(false)
  })

  it('is true only when explicitly enabled', () => {
    expect(isMultiBranchEnabled({ multi_branch_enabled: true })).toBe(true)
  })

  it('ignores truthy non-boolean values rather than coercing them', () => {
    // A stray string from an untyped write path must not silently switch the
    // storefront into a different flow.
    const tenant = { multi_branch_enabled: 'true' } as unknown as MultiBranchTenantFields
    expect(isMultiBranchEnabled(tenant)).toBe(false)
  })
})

describe('shouldPromptOutletSelection', () => {
  it('is false when the flag is off, however many outlets exist', () => {
    expect(shouldPromptOutletSelection({}, [outlet('a'), outlet('b')])).toBe(false)
  })

  it('is false when the flag is on but no outlets are configured', () => {
    expect(shouldPromptOutletSelection({ multi_branch_enabled: true }, [])).toBe(false)
  })

  it('is false when the flag is on and exactly one outlet is active', () => {
    // Hard constraint: a single-branch tenant skips selection entirely.
    expect(shouldPromptOutletSelection({ multi_branch_enabled: true }, [outlet('a')])).toBe(false)
  })

  it('ignores inactive outlets when counting', () => {
    const outlets = [outlet('a'), outlet('b', false), outlet('c', false)]
    expect(shouldPromptOutletSelection({ multi_branch_enabled: true }, outlets)).toBe(false)
  })

  it('is true when the flag is on and two or more outlets are active', () => {
    expect(
      shouldPromptOutletSelection({ multi_branch_enabled: true }, [outlet('a'), outlet('b')])
    ).toBe(true)
  })
})
