/**
 * The voucher form, on the two scopes that need a picker.
 *
 * Before this, choosing "Chosen products" produced an error the merchant had
 * no way to clear: the form demanded targets and offered no way to supply
 * them. What matters here is that picking a product both silences the error
 * and reaches `targetIds` on save, and that switching scope does not carry the
 * old scope's ids over — a category id in a product-scoped voucher matches
 * nothing.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VoucherForm } from '@/app/[tenant]/admin/vouchers/voucher-form'
import { saveVoucherAction } from '@/app/actions/voucher-admin'
import { getMenuItemsAction } from '@/app/actions/menu-items'
import { getCategoriesAction } from '@/app/actions/categories'

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

jest.mock('@/app/actions/voucher-admin', () => ({
  saveVoucherAction: jest.fn(async () => ({ success: true })),
}))

jest.mock('@/app/actions/menu-items', () => ({
  getMenuItemsAction: jest.fn(async () => ({
    success: true,
    data: [
      { id: 'item-latte', name: 'Iced Latte', category_id: 'cat-drinks' },
      { id: 'item-adobo', name: 'Chicken Adobo', category_id: 'cat-food' },
    ],
  })),
}))

jest.mock('@/app/actions/categories', () => ({
  getCategoriesAction: jest.fn(async () => ({
    success: true,
    data: [
      { id: 'cat-drinks', name: 'Drinks' },
      { id: 'cat-food', name: 'Rice Meals' },
    ],
  })),
}))

function renderForm() {
  return render(
    <VoucherForm
      tenantId="tenant-1"
      voucher={null}
      onSaved={jest.fn()}
      onCancel={jest.fn()}
    />
  )
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'SAVE10' } })
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Launch promo' } })
}

async function chooseScope(label: string) {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(label, 'i') }))
}

beforeEach(() => jest.clearAllMocks())

describe('scoped vouchers', () => {
  it('offers the tenant products once "Chosen products" is selected', async () => {
    renderForm()
    await chooseScope('Chosen products')

    expect(await screen.findByRole('checkbox', { name: /Iced Latte/i })).toBeInTheDocument()
    expect(getMenuItemsAction).toHaveBeenCalledWith('tenant-1')
  })

  it('offers the tenant categories once "Chosen categories" is selected', async () => {
    renderForm()
    await chooseScope('Chosen categories')

    expect(await screen.findByRole('checkbox', { name: /Rice Meals/i })).toBeInTheDocument()
    expect(getCategoriesAction).toHaveBeenCalledWith('tenant-1')
  })

  it('saves the picked product ids as the voucher targets', async () => {
    renderForm()
    fillRequiredFields()
    await chooseScope('Chosen products')

    fireEvent.click(await screen.findByRole('checkbox', { name: /Iced Latte/i }))
    fireEvent.click(screen.getByRole('button', { name: /Create voucher/i }))

    await waitFor(() => expect(saveVoucherAction).toHaveBeenCalled())
    const draft = (saveVoucherAction as jest.Mock).mock.calls[0][1]
    expect(draft.scope).toBe('products')
    expect(draft.targetIds).toEqual(['item-latte'])
  })

  it('clears the error once a product is picked', async () => {
    renderForm()
    fillRequiredFields()
    await chooseScope('Chosen products')

    // Force the error into view by attempting to save with nothing picked.
    fireEvent.click(screen.getByRole('button', { name: /Create voucher/i }))
    expect(await screen.findByText(/never apply/i)).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('checkbox', { name: /Iced Latte/i }))

    await waitFor(() => expect(screen.queryByText(/never apply/i)).not.toBeInTheDocument())
  })

  it('drops the previous scope ids when the scope changes', async () => {
    renderForm()
    fillRequiredFields()
    await chooseScope('Chosen products')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Iced Latte/i }))

    await chooseScope('Chosen categories')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Drinks/i }))
    fireEvent.click(screen.getByRole('button', { name: /Create voucher/i }))

    await waitFor(() => expect(saveVoucherAction).toHaveBeenCalled())
    const draft = (saveVoucherAction as jest.Mock).mock.calls[0][1]
    expect(draft.targetIds).toEqual(['cat-drinks'])
  })

  it('narrows the list as the merchant searches', async () => {
    renderForm()
    await chooseScope('Chosen products')
    await screen.findByRole('checkbox', { name: /Iced Latte/i })

    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'adobo' } })

    expect(screen.queryByRole('checkbox', { name: /Iced Latte/i })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Chicken Adobo/i })).toBeInTheDocument()
  })

  it('says so plainly when the products cannot be loaded', async () => {
    ;(getMenuItemsAction as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'boom',
    })
    renderForm()
    await chooseScope('Chosen products')

    expect(await screen.findByText(/Could not load your products/i)).toBeInTheDocument()
  })

  it('points a merchant with an empty menu at the real problem', async () => {
    ;(getCategoriesAction as jest.Mock).mockResolvedValueOnce({ success: true, data: [] })
    renderForm()
    await chooseScope('Chosen categories')

    expect(await screen.findByText(/no categories yet/i)).toBeInTheDocument()
  })

  it('no longer tells the merchant the pickers do not exist', async () => {
    renderForm()
    await chooseScope('Chosen products')

    expect(screen.queryByText(/not built yet/i)).not.toBeInTheDocument()
  })
})
