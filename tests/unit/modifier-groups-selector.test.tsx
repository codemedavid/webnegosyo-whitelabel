/**
 * Phase 2 (storefront) — presentational selector for unified modifier groups.
 *
 * Pure props-in / callback-out: it renders each group's options and reports a
 * toggle. All selection arithmetic lives in the tested adapter/hook; this
 * component only renders and forwards clicks.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import type { ModifierGroup } from '@/types/database'
import { ModifierGroupsSelector } from '@/components/customer/modifier-groups-selector'
import type { ModifierSelection } from '@/lib/modifier-groups-cart'

const sizeGroup: ModifierGroup = {
  id: 'g-size',
  name: 'Size',
  display_order: 0,
  min_select: 1,
  max_select: 1,
  options: [
    { id: 'o-small', name: 'Small', price_modifier: 0, display_order: 0 },
    { id: 'o-large', name: 'Large', price_modifier: 20, display_order: 1 },
  ],
}

const addonGroup: ModifierGroup = {
  id: 'g-addons',
  name: 'Add-ons',
  display_order: 1,
  min_select: 0,
  max_select: null,
  options: [
    { id: 'o-cheese', name: 'Extra Cheese', price_modifier: 15, display_order: 0 },
    {
      id: 'o-egg',
      name: 'Egg',
      price_modifier: 10,
      display_order: 1,
      stock_mode: 'simple',
      stock_qty: 0, // out of stock → unavailable
    },
  ],
}

const groups = [sizeGroup, addonGroup]

function renderSelector(selection: ModifierSelection, onToggle = jest.fn()) {
  render(
    <ModifierGroupsSelector groups={groups} selection={selection} onToggle={onToggle} />,
  )
  return onToggle
}

describe('ModifierGroupsSelector', () => {
  it('renders every group name', () => {
    renderSelector({})
    expect(screen.getByText('Size')).toBeInTheDocument()
    expect(screen.getByText('Add-ons')).toBeInTheDocument()
  })

  it('renders each option label', () => {
    renderSelector({})
    expect(screen.getByRole('button', { name: /Small/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Large/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Extra Cheese/ })).toBeInTheDocument()
  })

  it('calls onToggle with the group and option id when an option is clicked', () => {
    const onToggle = renderSelector({ 'g-size': ['o-small'] })
    fireEvent.click(screen.getByRole('button', { name: /Large/ }))
    expect(onToggle).toHaveBeenCalledWith(sizeGroup, 'o-large')
  })

  it('marks the selected option as pressed', () => {
    renderSelector({ 'g-size': ['o-small'] })
    expect(screen.getByRole('button', { name: /Small/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Large/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('disables an unavailable (out-of-stock) option and does not fire onToggle', () => {
    const onToggle = renderSelector({})
    const eggButton = screen.getByRole('button', { name: /Egg/ })
    expect(eggButton).toBeDisabled()
    fireEvent.click(eggButton)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('shows a required indicator on required groups and optional on the rest', () => {
    renderSelector({})
    expect(screen.getByText(/Required/i)).toBeInTheDocument()
    expect(screen.getByText(/Optional/i)).toBeInTheDocument()
  })

  it('renders nothing when there are no groups', () => {
    const { container } = render(
      <ModifierGroupsSelector groups={[]} selection={{}} onToggle={jest.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
