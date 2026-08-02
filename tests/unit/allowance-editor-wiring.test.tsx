/**
 * The allowance columns, as the platform owner uses them.
 *
 * This file exists because of a specific failure: `updateTenantLimitsAction`
 * shipped complete, guarded and clamped — and with no caller anywhere in the
 * app. The branch and seat allowances were enforceable but unsettable, so every
 * tenant sat on whatever the backfill gave them. A test that only exercised the
 * action would have stayed green through all of it.
 *
 * So the guarantee here is deliberately about the WIRE: the owner can see usage
 * against allowance, and a save reaches the server action with what they typed.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { buildSubscriptionRoster, summarizeRoster } from '@/lib/billing/subscription-roster'
import { buildAllowanceRows } from '@/lib/billing/tenant-allowances'
import { SubscriptionManager } from '@/components/superadmin/subscription-manager'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/superadmin/mark-paid-dialog', () => ({ MarkPaidDialog: () => null }))

const updateTenantLimitsAction = jest.fn()
jest.mock('@/app/actions/subscriptions', () => ({
  markTenantPaidAction: jest.fn(),
  setTenantPausedAction: jest.fn(),
  updateTenantLimitsAction: (...args: unknown[]) => updateTenantLimitsAction(...args),
}))

const NOW = '2026-08-10T07:00:00.000Z'

const TENANT = {
  tenantId: 't-1',
  name: 'Gungjeon Unlimited',
  slug: 'gungjeon',
  paidThrough: '2026-09-30',
}

function renderScreen(
  allowanceOverrides: Partial<Parameters<typeof buildAllowanceRows>[0][number]> = {}
) {
  const rows = buildSubscriptionRoster([TENANT], NOW)
  const allowances = buildAllowanceRows([
    {
      tenantId: TENANT.tenantId,
      maxOutlets: 2,
      maxStaffPerBranch: 3,
      outletIds: ['makati', 'bgc'],
      staff: [{ outletId: 'makati' }, { outletId: 'makati' }, { outletId: 'bgc' }],
      ...allowanceOverrides,
    },
  ])

  return render(
    <SubscriptionManager rows={rows} summary={summarizeRoster(rows)} allowances={allowances} />
  )
}

beforeEach(() => {
  updateTenantLimitsAction.mockReset()
  updateTenantLimitsAction.mockResolvedValue({ success: true })
})

describe('allowance columns', () => {
  it('shows branches used against the branch allowance', () => {
    renderScreen()

    expect(within(screen.getByTestId('allowance-outlets-t-1')).getByText('2 / 2')).toBeInTheDocument()
  })

  it('shows the fullest branch against the seat allowance', () => {
    // Makati holds two of the three seats; BGC holds one. The column reports
    // the branch that would refuse the next hire, not the store's four people.
    renderScreen()

    expect(within(screen.getByTestId('allowance-staff-t-1')).getByText('2 / 3')).toBeInTheDocument()
  })

  it('marks a tenant sitting above a lowered allowance', () => {
    renderScreen({ maxOutlets: 1 })

    expect(screen.getByTestId('allowance-outlets-t-1')).toHaveAttribute('data-over', 'true')
  })
})

describe('editing an allowance', () => {
  it('sends what the owner typed to the server action', async () => {
    // Arrange
    renderScreen()
    fireEvent.click(screen.getByTestId('allowance-edit-t-1'))

    // Act
    fireEvent.change(screen.getByLabelText(/branches/i), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/staff per branch/i), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: /save allowances/i }))

    // Assert — the wire this whole file exists to prove
    await waitFor(() => {
      expect(updateTenantLimitsAction).toHaveBeenCalledWith('t-1', {
        maxOutlets: 5,
        maxStaffPerBranch: 6,
      })
    })
  })

  it('opens prefilled with the allowances the tenant already has', () => {
    renderScreen()

    fireEvent.click(screen.getByTestId('allowance-edit-t-1'))

    expect(screen.getByLabelText(/branches/i)).toHaveValue(2)
    expect(screen.getByLabelText(/staff per branch/i)).toHaveValue(3)
  })

  it('warns before lowering an allowance below what the tenant holds', () => {
    // Lowering is allowed and takes nothing away — the caps bite on create
    // only. The dialog has to say so rather than block, or a client moving to
    // a smaller plan could never be put on it.
    renderScreen()
    fireEvent.click(screen.getByTestId('allowance-edit-t-1'))

    fireEvent.change(screen.getByLabelText(/branches/i), { target: { value: '1' } })

    expect(screen.getByTestId('allowance-downgrade-note')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save allowances/i })).toBeEnabled()
  })

  it('surfaces a failed save instead of closing on it', async () => {
    // A dialog that closed on failure would report success by disappearing,
    // and the owner would believe a client had been upgraded who had not.
    updateTenantLimitsAction.mockResolvedValue({ success: false, error: 'Not allowed' })
    renderScreen()
    fireEvent.click(screen.getByTestId('allowance-edit-t-1'))

    fireEvent.click(screen.getByRole('button', { name: /save allowances/i }))

    expect(await screen.findByText('Not allowed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save allowances/i })).toBeInTheDocument()
  })
})
