import { describe, it, expect } from '@jest/globals'
import {
  isDestructiveOpName,
  assertNonDestructiveOpName,
  assertNoTenantDeactivation,
} from '@/lib/mcp/op-safety'

describe('isDestructiveOpName', () => {
  it('flags every destructive verb regardless of position in a snake_case name', () => {
    const destructive = [
      'delete_tenant',
      'drop_menu_item',
      'remove_category',
      'destroy_bundle',
      'deprovision_tenant',
      'truncate_orders',
      'purge_customers',
      'wipe_data',
      'teardown_tenant',
      'erase_addon',
      'tenant_delete', // verb as suffix
    ]
    for (const name of destructive) {
      expect(isDestructiveOpName(name)).toBe(true)
    }
  })

  it('allows the create/read/update surface the MCP actually exposes', () => {
    const safe = [
      'create_tenant',
      'add_category',
      'add_menu_item',
      'add_addon_library_entry',
      'create_upsell_pair',
      'create_bundle',
      'add_payment_method',
      'update_branding',
      'configure_integration',
      'list_tenants',
      'get_tenant',
    ]
    for (const name of safe) {
      expect(isDestructiveOpName(name)).toBe(false)
    }
  })

  it('does not false-positive on words that merely contain a destructive substring', () => {
    // "predelete" / "dropdown" are not standalone destructive tokens.
    expect(isDestructiveOpName('undelete_recovery')).toBe(false)
    expect(isDestructiveOpName('dropdown_config')).toBe(false)
  })
})

describe('assertNonDestructiveOpName', () => {
  it('throws with an actionable message for a destructive op name', () => {
    expect(() => assertNonDestructiveOpName('delete_tenant')).toThrow(/destructive/i)
  })

  it('is a no-op for a safe op name', () => {
    expect(() => assertNonDestructiveOpName('create_tenant')).not.toThrow()
  })
})

describe('assertNoTenantDeactivation', () => {
  it('throws when a payload explicitly deactivates a tenant', () => {
    expect(() => assertNoTenantDeactivation({ is_active: false })).toThrow(/deactivat/i)
  })

  it('allows re-activating or leaving is_active untouched', () => {
    expect(() => assertNoTenantDeactivation({ is_active: true })).not.toThrow()
    expect(() => assertNoTenantDeactivation({ lalamove_enabled: true })).not.toThrow()
    expect(() => assertNoTenantDeactivation({})).not.toThrow()
  })
})
