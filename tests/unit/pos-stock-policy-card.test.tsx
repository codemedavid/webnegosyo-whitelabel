/**
 * Inventory → "When stock runs short at the register". Two choices, owner only.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const setPosStockPolicyAction = jest.fn()
jest.mock('@/app/actions/pos-stock-policy', () => ({
  setPosStockPolicyAction: (...a: unknown[]) => setPosStockPolicyAction(...a),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'

async function renderCard(props: { policy: 'warn' | 'block'; canChange: boolean }) {
  const { PosStockPolicyCard } = await import('@/components/admin/pos-stock-policy-card')
  return render(<PosStockPolicyCard tenantId={TENANT} tenantSlug="lolys" {...props} />)
}

beforeEach(() => {
  jest.clearAllMocks()
  setPosStockPolicyAction.mockResolvedValue({ success: true, policy: 'block' })
})

describe('PosStockPolicyCard', () => {
  it('asks the question with both choices, warn marked as the default and selected', async () => {
    await renderCard({ policy: 'warn', canChange: true })

    expect(screen.getByText('When stock runs short at the register')).toBeInTheDocument()
    const warn = screen.getByRole('radio', { name: /Warn the cashier \(default\)/ })
    const block = screen.getByRole('radio', { name: /Ask for a manager PIN/ })
    expect(warn).toHaveAttribute('aria-checked', 'true')
    expect(block).toHaveAttribute('aria-checked', 'false')
  })

  it('lets the owner switch to the manager PIN', async () => {
    await renderCard({ policy: 'warn', canChange: true })

    fireEvent.click(screen.getByRole('radio', { name: /Ask for a manager PIN/ }))

    await waitFor(() => expect(setPosStockPolicyAction).toHaveBeenCalledWith(TENANT, 'lolys', 'block'))
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Ask for a manager PIN/ })).toHaveAttribute('aria-checked', 'true'),
    )
  })

  it('goes back to the saved choice when the save is refused', async () => {
    setPosStockPolicyAction.mockResolvedValue({ success: false, error: 'Only the store owner can change this.' })
    await renderCard({ policy: 'warn', canChange: true })

    fireEvent.click(screen.getByRole('radio', { name: /Ask for a manager PIN/ }))

    await waitFor(() => expect(setPosStockPolicyAction).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Warn the cashier/ })).toHaveAttribute('aria-checked', 'true'),
    )
  })

  it('shows staff the rule but not the switch', async () => {
    await renderCard({ policy: 'block', canChange: false })

    expect(screen.getByText('Only the store owner can change this.')).toBeInTheDocument()
    const warn = screen.getByRole('radio', { name: /Warn the cashier/ })
    expect(warn).toBeDisabled()
    fireEvent.click(warn)
    expect(setPosStockPolicyAction).not.toHaveBeenCalled()
  })
})
