/**
 * Which store does a manage-staff call act on?
 *
 * The edge function derives the tenant from the caller's own app_users row —
 * never from the request body — which is right for owners and branch admins.
 * The platform superadmin's row carries NO tenant (tenant_id is NULL), so that
 * rule turned every Team-screen call made while impersonating a store into
 * "No store access for this account." The superadmin is the one caller allowed
 * to name the store it is acting on; everyone else's body value is ignored.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import {
  resolveStaffCaller,
  type StaffCallerRow,
} from '../../supabase/functions/manage-staff/staff-core'

const OWNER: StaffCallerRow = {
  user_id: 'owner-1',
  tenant_id: 'tenant-a',
  role: 'admin',
  is_owner: true,
  outlet_id: null,
  permissions: null,
}

const SUPERADMIN: StaffCallerRow = {
  user_id: 'super-1',
  tenant_id: null,
  role: 'superadmin',
  is_owner: false,
  outlet_id: null,
  permissions: null,
}

describe('resolveStaffCaller', () => {
  it('takes the tenant from an owner row and ignores the request body', () => {
    // Arrange / Act
    const result = resolveStaffCaller(OWNER, 'tenant-someone-else')

    // Assert
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.caller.tenant_id).toBe('tenant-a')
  })

  it('lets a superadmin act on the store it named', () => {
    // Arrange / Act
    const result = resolveStaffCaller(SUPERADMIN, 'tenant-a')

    // Assert
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.caller.tenant_id).toBe('tenant-a')
    expect(result.caller.role).toBe('superadmin')
  })

  it('refuses a superadmin who named no store', () => {
    // Arrange / Act
    const result = resolveStaffCaller(SUPERADMIN, null)

    // Assert
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
    expect(result.error).toMatch(/store/i)
  })

  it('refuses a superadmin who named a blank store', () => {
    // Arrange / Act
    const result = resolveStaffCaller(SUPERADMIN, '   ')

    // Assert
    expect(result.ok).toBe(false)
  })

  it('refuses an account with no access row at all', () => {
    // Arrange / Act
    const result = resolveStaffCaller(null, 'tenant-a')

    // Assert
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
    expect(result.error).toBe('No store access for this account.')
  })

  it('refuses a non-superadmin row that carries no tenant, body value or not', () => {
    // Arrange
    const orphan: StaffCallerRow = { ...OWNER, tenant_id: null, is_owner: false }

    // Act
    const result = resolveStaffCaller(orphan, 'tenant-a')

    // Assert
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
  })
})

// The Deno entrypoint cannot run under Jest, so the wiring is pinned by
// source: the 403 must come from the shared resolver above, which is the only
// place that knows a superadmin may name its store.
describe('manage-staff entrypoint wiring', () => {
  const source = readFileSync(
    join(__dirname, '../../supabase/functions/manage-staff/index.ts'),
    'utf8'
  )

  it('resolves the caller through the core rather than reading tenant_id itself', () => {
    expect(source).toMatch(/resolveStaffCaller\(/)
    expect(source).not.toMatch(/No store access for this account\./)
  })

  it('passes the body tenantId into the resolver', () => {
    expect(source).toMatch(/resolveStaffCaller\([\s\S]{0,200}?tenantId/)
  })
})
