/**
 * The Categories dialog: a starter category keeps its group and "Needs a
 * note" (the database guard refuses both), so those controls are locked with
 * the reason beside them instead of failing with "You don't have access".
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { category, ICE, TENANT_SLUG } from './ui-fixtures'

jest.mock('@/app/actions/expenses', () => ({
  saveCategoryAction: jest.fn(),
  archiveCategoryAction: jest.fn(),
}))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))

const MINE = category('Ukay supplies', 'operating', { icon: 'UK', sortOrder: 300 })

async function renderDialog() {
  const { CategoriesDialog } = await import('@/components/admin/expenses/categories-dialog')
  return render(<CategoriesDialog isOpen onOpenChange={jest.fn()} tenantSlug={TENANT_SLUG} categories={[ICE, MINE]} />)
}

describe('CategoriesDialog', () => {
  it('locks a starter category’s group and note rule, and says why', async () => {
    await renderDialog()
    fireEvent.click(screen.getByRole('button', { name: `Edit ${ICE.name}` }))

    expect(screen.getByRole('combobox', { name: 'Counts as' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Needs a note' })).toBeDisabled()
    expect(screen.getByText(/Starter categories keep their group and note setting/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeEnabled()
  })

  it('leaves a category the owner added editable', async () => {
    await renderDialog()
    fireEvent.click(screen.getByRole('button', { name: `Edit ${MINE.name}` }))

    expect(screen.getByRole('combobox', { name: 'Counts as' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Needs a note' })).toBeEnabled()
    expect(screen.queryByText(/Starter categories keep their group/)).not.toBeInTheDocument()
  })
})
