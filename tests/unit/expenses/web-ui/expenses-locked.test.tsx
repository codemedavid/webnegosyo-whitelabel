/**
 * Who may open the expense book, and what everyone else is told.
 */

import { render, screen } from '@testing-library/react'
import { expensesAccessFor } from '@/components/admin/expenses/expenses-access'
import { ExpensesLocked } from '@/components/admin/expenses/expenses-states'
import { TENANT_ID } from './ui-fixtures'

const OTHER_TENANT = '00000000-0000-4000-8000-0000000000ff'
const BRANCH = '00000000-0000-4000-8000-0000000000aa'

describe('expensesAccessFor', () => {
  it('lets the owner in, store-wide', () => {
    expect(expensesAccessFor({ role: 'admin', tenant_id: TENANT_ID, is_owner: true, permissions: [] }, TENANT_ID)).toEqual({
      ok: true,
      scope: { kind: 'all' },
    })
  })

  it('refuses staff without the Expenses key, even with Reports and Costs', () => {
    const staff = { role: 'admin', tenant_id: TENANT_ID, is_owner: false, permissions: ['reports', 'costs', 'pos'] }
    expect(expensesAccessFor(staff, TENANT_ID)).toEqual({ ok: false, reason: 'no_permission' })
  })

  it('keeps a branch-locked account to its own branch', () => {
    const manager = { role: 'admin', tenant_id: TENANT_ID, is_owner: false, permissions: ['expenses'], outlet_id: BRANCH }
    expect(expensesAccessFor(manager, TENANT_ID)).toEqual({ ok: true, scope: { kind: 'branch', outletId: BRANCH } })
  })

  it('fails closed: no account, another store, platform staff', () => {
    expect(expensesAccessFor(null, TENANT_ID)).toEqual({ ok: false, reason: 'no_account' })
    expect(expensesAccessFor({ role: 'admin', tenant_id: OTHER_TENANT, is_owner: true }, TENANT_ID)).toEqual({ ok: false, reason: 'other_store' })
    expect(expensesAccessFor({ role: 'platform_staff', tenant_id: null }, TENANT_ID)).toEqual({ ok: false, reason: 'no_permission' })
  })
})

describe('ExpensesLocked', () => {
  it('tells staff who to ask, kindly', () => {
    render(<ExpensesLocked />)

    expect(screen.getByText('Only the owner can see expenses.')).toBeInTheDocument()
    expect(screen.getByText('Ask them to turn on ‘Expenses’ for you.')).toBeInTheDocument()
  })
})
