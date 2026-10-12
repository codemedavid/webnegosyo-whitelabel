import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { GovLedgerWorkspace } from '@/components/admin/gov-discounts/gov-ledger-workspace'
import { reviewGovDiscountAction } from '@/app/actions/gov-discount-review'
import { grantEntry, review } from '../../fixtures/gov-discount-claims'

jest.mock('@/app/actions/gov-discount-review', () => ({
  reviewGovDiscountAction: jest.fn(async () => ({ success: true })),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const TENANT = '11111111-1111-4111-8111-111111111111'

const flagged = grantEntry({
  id: '22222222-2222-4222-8222-222222222222',
  claimantName: 'Lola Remedios',
  idNumber: 'OSCA-0001234',
  flags: ['amount_mismatch'],
  serverReduction: 30,
  reduction: 32,
  grantedByName: 'Ana',
})
const reviewedPwd = {
  ...grantEntry({ kind: 'pwd', claimantName: 'Pedro Santos', idNumber: '13-7404-000-0009876', grantedByName: 'Ben' }),
  reviews: [review({ claimId: 'x', verdict: 'problem', note: 'Asked Ben to check', reviewerName: 'Owner' })],
}

function renderWorkspace() {
  return render(
    <GovLedgerWorkspace
      tenantId={TENANT}
      tenantSlug="kape"
      grants={[flagged, reviewedPwd]}
      grantCount={2}
      needsALook={[flagged]}
      kinds={['senior', 'pwd']}
      outlets={[]}
    />,
  )
}

describe('GovLedgerWorkspace', () => {
  beforeEach(() => jest.clearAllMocks())

  it('masks ID numbers until a row asks to show one', () => {
    renderWorkspace()
    expect(screen.queryByText('OSCA-0001234')).not.toBeInTheDocument()

    const list = screen.getByRole('region', { name: 'Every discount given' })
    fireEvent.click(within(list).getByRole('button', { name: 'Show ID number of Lola Remedios' }))
    expect(within(list).getByText('OSCA-0001234')).toBeInTheDocument()
    expect(screen.queryByText('13-7404-000-0009876')).not.toBeInTheDocument()
  })

  it('lists flagged grants under Needs a look with the engine’s explanation', () => {
    renderWorkspace()
    const panel = screen.getByRole('region', { name: /Needs a look/ })
    expect(within(panel).getByText('Lola Remedios')).toBeInTheDocument()
    expect(within(panel).getByText('Amount differs')).toBeInTheDocument()
    expect(within(panel).getByText(/took off a different amount/)).toBeInTheDocument()
  })

  it('filters the list by search and flagged-only', () => {
    renderWorkspace()
    const list = screen.getByRole('region', { name: 'Every discount given' })

    fireEvent.change(screen.getByLabelText('Search by name, ID or order number'), { target: { value: '9876' } })
    expect(within(list).queryByText('Lola Remedios')).not.toBeInTheDocument()
    expect(within(list).getByText('Pedro Santos')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search by name, ID or order number'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('switch'))
    expect(within(list).getByText('Lola Remedios')).toBeInTheDocument()
    expect(within(list).queryByText('Pedro Santos')).not.toBeInTheDocument()
  })

  it('opens the detail with the check, the flag and the review history', () => {
    renderWorkspace()
    fireEvent.click(within(screen.getByRole('region', { name: 'Every discount given' })).getByRole('button', { name: 'Pedro Santos' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Asked Ben to check')).toBeInTheDocument()
    expect(within(sheet).getByText('Problem noted')).toBeInTheDocument()
  })

  it('marks a problem with a note through the server action', async () => {
    renderWorkspace()
    fireEvent.click(within(screen.getByRole('region', { name: /Needs a look/ })).getByRole('button', { name: /Lola Remedios/ }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Rules allow')).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Mark as a problem' }))
    const save = within(sheet).getByRole('button', { name: 'Save as a problem' })
    expect(save).toBeDisabled()
    fireEvent.change(within(sheet).getByLabelText(/What is wrong/), { target: { value: 'Wrong amount' } })
    fireEvent.click(save)

    await waitFor(() =>
      expect(reviewGovDiscountAction).toHaveBeenCalledWith({
        tenantId: TENANT,
        tenantSlug: 'kape',
        claimId: flagged.id,
        verdict: 'problem',
        note: 'Wrong amount',
      }),
    )
  })

  it('shows the action’s refusal in place', async () => {
    jest.mocked(reviewGovDiscountAction).mockResolvedValueOnce({ success: false, error: 'That discount is no longer in your sales book.' })
    renderWorkspace()
    fireEvent.click(within(screen.getByRole('region', { name: /Needs a look/ })).getByRole('button', { name: /Lola Remedios/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark OK' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer in your sales book')
  })
})
