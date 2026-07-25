/**
 * Phase 1c — "Add from library" picker for reusable modifier groups.
 *
 * Presentational container: opens a dialog, loads the tenant's active library
 * entries via the server action, lets the merchant multi-select, and hands the
 * chosen entries back through `onAttach`. All snapshot/attach arithmetic lives
 * in the tested `attachEntriesToGroups` helper — this component only picks.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ModifierGroupLibraryEntry } from '@/types/database'
import { ModifierLibraryPicker } from '@/components/admin/modifier-library-picker'

// Mock the server action the picker calls to load entries.
const getModifierGroupLibraryAction = jest.fn()
jest.mock('@/app/actions/modifier-library', () => ({
  getModifierGroupLibraryAction: (...args: unknown[]) => getModifierGroupLibraryAction(...args),
}))

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }))

function makeEntry(overrides: Partial<ModifierGroupLibraryEntry> = {}): ModifierGroupLibraryEntry {
  return {
    id: 'lib-size',
    tenant_id: 't1',
    name: 'Size',
    min_select: 1,
    max_select: 1,
    options: [
      { id: 'o-s', name: 'Small', price_modifier: 0, display_order: 0 },
      { id: 'o-l', name: 'Large', price_modifier: 20, display_order: 1 },
    ],
    source_menu_item_id: null,
    is_active: true,
    display_order: 0,
    created_at: '2026-07-25T00:00:00Z',
    updated_at: '2026-07-25T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  getModifierGroupLibraryAction.mockReset()
})

describe('ModifierLibraryPicker', () => {
  it('loads and lists only active library entries when opened', async () => {
    getModifierGroupLibraryAction.mockResolvedValue({
      success: true,
      data: [
        makeEntry(),
        makeEntry({ id: 'lib-inactive', name: 'Retired', is_active: false }),
      ],
    })

    render(<ModifierLibraryPicker tenantId="t1" onAttach={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add from library/i }))

    expect(await screen.findByText('Size')).toBeInTheDocument()
    expect(screen.queryByText('Retired')).not.toBeInTheDocument()
    expect(getModifierGroupLibraryAction).toHaveBeenCalledWith('t1')
  })

  it('shows an empty-state message when the library has no active entries', async () => {
    getModifierGroupLibraryAction.mockResolvedValue({ success: true, data: [] })

    render(<ModifierLibraryPicker tenantId="t1" onAttach={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add from library/i }))

    expect(await screen.findByText(/library is empty/i)).toBeInTheDocument()
  })

  it('hands the selected entries back through onAttach', async () => {
    const entry = makeEntry()
    getModifierGroupLibraryAction.mockResolvedValue({ success: true, data: [entry] })
    const onAttach = jest.fn()

    render(<ModifierLibraryPicker tenantId="t1" onAttach={onAttach} />)
    fireEvent.click(screen.getByRole('button', { name: /add from library/i }))

    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: /attach/i }))

    await waitFor(() => expect(onAttach).toHaveBeenCalledTimes(1))
    expect(onAttach).toHaveBeenCalledWith([entry])
  })
})
