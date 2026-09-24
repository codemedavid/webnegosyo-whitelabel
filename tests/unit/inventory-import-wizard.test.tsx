/**
 * The import wizard, end to end in the browser.
 *
 * A file in our own columns skips matching and lands on the review; an unknown
 * unit is fixed once for every row that uses it; the import button names how
 * many ingredients it will save; the finish screen says what happened and the
 * list underneath receives the saved rows.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

jest.mock('@/app/actions/inventory-import', () => ({
  importIngredientsBatchAction: jest.fn(),
}))

const KG: InventoryUnitRow = {
  id: '00000000-0000-4000-8000-00000000000a',
  tenant_id: 't1',
  name: 'Kilogram',
  abbreviation: 'kg',
  dimension: 'weight',
  to_base_factor: 1000,
  is_base: false,
  is_active: true,
  created_at: '',
  updated_at: '',
}

function savedItem(name: string): InventoryItem {
  return {
    id: `id-${name}`,
    tenant_id: 't1',
    name,
    sku: null,
    category: null,
    stock_unit_id: KG.id,
    unit_cost: 0,
    is_prep: false,
    image_url: null,
    current_qty: 0,
    reorder_level: 0,
    is_active: true,
    created_at: '',
    updated_at: '',
  }
}

function csvFile(text: string, name = 'pantry.csv') {
  const file = new File([text], name, { type: 'text/csv' })
  // jsdom's File has no text(); the wizard only needs this much of the API.
  Object.defineProperty(file, 'text', { value: async () => text })
  return file
}

async function renderWizard(onImported = jest.fn()) {
  const actions = await import('@/app/actions/inventory-import')
  const { ImportWizard } = await import('@/components/admin/inventory-import/import-wizard')
  const action = jest.mocked(actions.importIngredientsBatchAction)
  action.mockImplementation(async (_tenantId, batch) => ({
    success: true as const,
    data: (batch as { rows: { rowNumber: number; input: { name: string } }[] }).rows.map((row) => ({
      rowNumber: row.rowNumber,
      outcome: 'created' as const,
      item: savedItem(row.input.name),
    })),
  }))

  render(
    <ImportWizard
      open
      onOpenChange={jest.fn()}
      tenantId="t1"
      storeName="Juan Cafe"
      ingredients={[]}
      units={[KG]}
      branches={[]}
      isTemplatePending={false}
      onDownloadTemplate={jest.fn()}
      onImported={onImported}
    />,
  )
  return { action, onImported }
}

function upload(file: File) {
  fireEvent.change(screen.getByLabelText(/choose a spreadsheet/i), { target: { files: [file] } })
}

describe('ImportWizard', () => {
  it('skips matching for a file in our own columns and imports it', async () => {
    const { action, onImported } = await renderWizard()

    upload(csvFile('Name,Unit,Unit cost\nFlour,kg,50\nSugar,kgs,60\n'))

    expect(await screen.findByText('Every column matched')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 ingredients' }))

    expect(await screen.findByText('2 ingredients imported')).toBeInTheDocument()
    expect(action).toHaveBeenCalledTimes(1)
    expect(onImported).toHaveBeenCalledWith([savedItem('Flour'), savedItem('Sugar')])
  })

  it('asks what an unfamiliar column holds before reviewing', async () => {
    await renderWizard()

    upload(csvFile('Ingredient,Supplier\nFlour,ACME\n'))

    expect(await screen.findByText('Match your columns')).toBeInTheDocument()
    expect(screen.getByText(/We matched/)).toHaveTextContent('We matched 1 of 2 for you.')
    expect(screen.getByText('ACME')).toBeInTheDocument()
  })

  it('holds back rows it cannot read and says how many', async () => {
    await renderWizard()

    upload(csvFile('Name,Unit\nFlour,kg\nSoy sauce,bottle\n'))

    expect(await screen.findByText('One unit we don’t recognise')).toBeInTheDocument()
    expect(screen.getAllByText('1 row needs fixing and will be skipped.').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Import 1 ingredient' })).toBeEnabled()
  })

  it('explains a file with nothing in it', async () => {
    await renderWizard()

    upload(csvFile('Name,Unit\n'))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/couldn’t find any ingredients/i)).toBeInTheDocument()
  })

  it('reports rows the server could not save and keeps the rest', async () => {
    const { action } = await renderWizard()
    action.mockResolvedValueOnce({
      success: false as const,
      error: 'You don’t have permission to change ingredients.',
    })

    upload(csvFile('Name,Unit\nFlour,kg\n'))
    fireEvent.click(await screen.findByRole('button', { name: 'Import 1 ingredient' }))

    await waitFor(() => expect(screen.getByText('Nothing was imported')).toBeInTheDocument())
    expect(screen.getByText(/permission/)).toBeInTheDocument()
  })
})
