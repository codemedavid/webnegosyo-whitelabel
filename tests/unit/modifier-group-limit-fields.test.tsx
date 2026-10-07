/**
 * The "At least" / "At most" fields of a modifier group are typed into, one
 * keystroke at a time. A keystroke on the way to a number must not rewrite the
 * group's rule: emptying "At least" to retype it used to store 0, which made
 * the group optional and removed the field the owner was typing in; typing "1"
 * on the way to "12" in "At most" turned a "Several" group into "One".
 */

import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ModifierGroup } from '@/types/database'
import { ModifierGroupsEditor } from '@/components/admin/modifier-groups-editor'

jest.mock('@/components/admin/modifier-option-recipe-editor', () => ({
  ModifierOptionRecipeEditor: () => <div data-testid="recipe-editor" />,
}))

jest.mock('@/components/shared/image-upload', () => ({
  ImageUpload: () => <div data-testid="image-upload" />,
}))

function pickSomeGroup(overrides: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id: 'grp-sides',
    name: 'Sides',
    display_order: 0,
    min_select: 1,
    max_select: null,
    selection_mode: 'choice',
    options: [],
    ...overrides,
  }
}

function Harness({ initial, onGroups }: { initial: ModifierGroup; onGroups: (groups: ModifierGroup[]) => void }) {
  const [groups, setGroups] = useState<ModifierGroup[]>([initial])
  return (
    <ModifierGroupsEditor
      groups={groups}
      basePrice={0}
      onChange={(next) => {
        setGroups(next)
        onGroups(next)
      }}
    />
  )
}

function renderHarness(initial: ModifierGroup) {
  let latest: ModifierGroup[] = [initial]
  render(<Harness initial={initial} onGroups={(next) => { latest = next }} />)
  return { latest: () => latest[0] }
}

describe('modifier group limit fields', () => {
  it('keeps a required group required while "At least" is emptied and retyped', () => {
    const { latest } = renderHarness(pickSomeGroup())
    const atLeast = screen.getByLabelText('At least')

    fireEvent.change(atLeast, { target: { value: '' } })
    expect(screen.getByLabelText('At least')).toBe(atLeast)
    expect(latest().min_select).toBe(1)

    fireEvent.change(atLeast, { target: { value: '2' } })
    expect(latest().min_select).toBe(2)
    expect(screen.getByRole('switch', { name: /required for sides/i })).toBeChecked()
  })

  it('shows the stored minimum again when the field is left empty', () => {
    renderHarness(pickSomeGroup({ min_select: 3 }))
    const atLeast = screen.getByLabelText('At least')

    fireEvent.change(atLeast, { target: { value: '' } })
    fireEvent.blur(atLeast)

    expect(atLeast).toHaveValue(3)
  })

  it('does not turn "Several" into "One" while a cap of 12 is being typed', () => {
    const { latest } = renderHarness(pickSomeGroup({ min_select: 0 }))
    const atMost = screen.getByLabelText('At most')

    fireEvent.change(atMost, { target: { value: '1' } })
    expect(latest().max_select).toBeNull()
    expect(screen.getByRole('radio', { name: 'Several' })).toBeChecked()

    fireEvent.change(atMost, { target: { value: '12' } })
    expect(latest().max_select).toBe(12)
    fireEvent.blur(atMost)
    expect(latest().max_select).toBe(12)
  })

  it('does not lower the minimum on the way to a larger extras cap', () => {
    const { latest } = renderHarness(pickSomeGroup({ selection_mode: 'quantity', min_select: 3 }))
    const maxPortions = screen.getByLabelText('Max portions')

    fireEvent.change(maxPortions, { target: { value: '1' } })
    expect(latest().min_select).toBe(3)

    fireEvent.change(maxPortions, { target: { value: '10' } })
    expect(latest()).toMatchObject({ min_select: 3, max_select: 10 })
  })

  it('stores a cap below the minimum once the owner leaves the field', () => {
    const { latest } = renderHarness(pickSomeGroup({ selection_mode: 'quantity', min_select: 3, max_select: 5 }))
    const maxPortions = screen.getByLabelText('Max portions')

    fireEvent.change(maxPortions, { target: { value: '2' } })
    expect(latest().max_select).toBe(5)

    fireEvent.blur(maxPortions)
    expect(latest()).toMatchObject({ min_select: 2, max_select: 2 })
  })

  it('clears the cap as soon as "At most" is emptied', () => {
    const { latest } = renderHarness(pickSomeGroup({ max_select: 4 }))
    fireEvent.change(screen.getByLabelText('At most'), { target: { value: '' } })
    expect(latest().max_select).toBeNull()
  })
})
