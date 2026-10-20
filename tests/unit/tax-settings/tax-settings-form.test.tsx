/**
 * Settings → Tax & discounts, as the owner and as read-only staff see it.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { defaultTaxProfile } from '@/lib/gov-discount'
import { formValuesFromProfile } from '@/lib/tax-settings/form-mapping'

const saveTaxSettingsAction = jest.fn()

jest.mock('@/app/actions/tax-settings', () => ({
  saveTaxSettingsAction: (...args: unknown[]) => saveTaxSettingsAction(...args),
  setApprovalPinAction: jest.fn(),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

async function renderForm(options: { isSetUp: boolean; canEdit: boolean }) {
  const { TaxSettingsForm } = await import('@/components/admin/tax-settings/tax-settings-form')
  const profile = options.isSetUp ? { ...defaultTaxProfile('vat'), tin: '123-456-789' } : null
  return render(
    <TaxSettingsForm
      tenantId="t1"
      tenantSlug="sukad"
      defaults={formValuesFromProfile(profile)}
      hasProfile={options.isSetUp}
      canEdit={options.canEdit}
    />,
  )
}

beforeEach(() => {
  saveTaxSettingsAction.mockReset()
  saveTaxSettingsAction.mockResolvedValue({ success: true })
})

describe('TaxSettingsForm', () => {
  it('shows the ₱560 example worked out by the engine for both registrations', async () => {
    await renderForm({ isSetUp: false, canEdit: true })

    expect(screen.getByText('₱560 meal → a senior or PWD pays ₱400')).toBeInTheDocument()
    expect(screen.getByText('₱560 meal → a senior or PWD pays ₱448')).toBeInTheDocument()
  })

  it('shows Senior and PWD as always on, with no switch to turn them off', async () => {
    await renderForm({ isSetUp: true, canEdit: true })

    expect(screen.getAllByText('Always on')).toHaveLength(2)
    expect(screen.queryByRole('switch', { name: /Senior Citizen/ })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Medal of Valor' })).not.toBeChecked()
  })

  it('makes a store without a profile pick its VAT status before saving', async () => {
    await renderForm({ isSetUp: false, canEdit: true })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('Choose VAT-registered or Non-VAT')).toBeInTheDocument()
    expect(saveTaxSettingsAction).not.toHaveBeenCalled()
  })

  it('formats the TIN as it is typed and previews the receipt header', async () => {
    await renderForm({ isSetUp: true, canEdit: true })

    fireEvent.change(screen.getByLabelText(/^TIN/), { target: { value: '98765432100000' } })

    expect(screen.getByLabelText(/^TIN/)).toHaveValue('987-654-321-00000')
    expect(screen.getByText('VAT REG TIN 987-654-321-00000')).toBeInTheDocument()
  })

  it('shows the not-an-invoice line until the POS is BIR-registered, then asks for its numbers', async () => {
    await renderForm({ isSetUp: true, canEdit: true })

    expect(screen.getByText('THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: /My POS is BIR-registered/ }))

    expect(screen.getByLabelText(/^MIN/)).toBeInTheDocument()
    expect(screen.queryByText('THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.')).not.toBeInTheDocument()
  })

  it('saves the owner’s choices', async () => {
    await renderForm({ isSetUp: true, canEdit: true })

    fireEvent.click(screen.getByRole('radio', { name: /Always/ }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(saveTaxSettingsAction).toHaveBeenCalled())
    expect(saveTaxSettingsAction.mock.calls[0][2]).toMatchObject({ vatStatus: 'vat', approvalRule: 'always' })
  })

  it('gives read-only staff the same page with every control disabled and no save bar', async () => {
    await renderForm({ isSetUp: true, canEdit: false })

    expect(screen.getByRole('switch', { name: 'Medal of Valor' })).toBeDisabled()
    expect(screen.getByLabelText(/^TIN/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })
})
