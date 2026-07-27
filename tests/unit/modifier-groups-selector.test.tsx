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

/**
 * Multi-select groups with min/max picks. Previously the selector rendered
 * single- and multi-select identically and showed no count rule, so a shopper
 * discovered "choose 2 to 3" only by pressing Add to Cart and reading a toast,
 * and could keep tapping past the cap while `toggleOption` silently ignored it.
 */
const pickTwoToThree: ModifierGroup = {
  id: 'g-toppings',
  name: 'Toppings',
  display_order: 0,
  min_select: 2,
  max_select: 3,
  options: [
    { id: 'o-ham', name: 'Ham', price_modifier: 10, display_order: 0 },
    { id: 'o-corn', name: 'Corn', price_modifier: 5, display_order: 1 },
    { id: 'o-olive', name: 'Olive', price_modifier: 8, display_order: 2 },
    { id: 'o-basil', name: 'Basil', price_modifier: 6, display_order: 3 },
  ],
}

function renderMulti(selection: ModifierSelection, onToggle = jest.fn()) {
  render(
    <ModifierGroupsSelector
      groups={[pickTwoToThree]}
      selection={selection}
      onToggle={onToggle}
    />,
  )
  return onToggle
}

describe('ModifierGroupsSelector multi-select rules', () => {
  it('shows the min/max rule so the shopper knows the count before submitting', () => {
    renderMulti({})
    expect(screen.getByText('Required — choose 2 to 3')).toBeInTheDocument()
  })

  it('shows how many are still needed to meet the minimum', () => {
    renderMulti({ 'g-toppings': ['o-ham'] })
    expect(screen.getByText(/1 more/i)).toBeInTheDocument()
  })

  it('reports the selected count once the minimum is met', () => {
    renderMulti({ 'g-toppings': ['o-ham', 'o-corn'] })
    expect(screen.getByText('2 of 3 selected')).toBeInTheDocument()
  })

  it('exposes multi-select options as checkboxes, not radio-style chips', () => {
    renderMulti({ 'g-toppings': ['o-ham'] })
    const ham = screen.getByRole('button', { name: /Ham/ })
    expect(ham).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: /Corn/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('disables unselected options once the cap is reached', () => {
    renderMulti({ 'g-toppings': ['o-ham', 'o-corn', 'o-olive'] })
    expect(screen.getByRole('button', { name: /Basil/ })).toBeDisabled()
  })

  it('keeps already-selected options clickable at the cap so they can be removed', () => {
    const onToggle = renderMulti({ 'g-toppings': ['o-ham', 'o-corn', 'o-olive'] })
    const ham = screen.getByRole('button', { name: /Ham/ })

    expect(ham).not.toBeDisabled()
    fireEvent.click(ham)
    expect(onToggle).toHaveBeenCalledWith(pickTwoToThree, 'o-ham')
  })

  it('leaves single-select options swappable and free of checkbox semantics', () => {
    render(
      <ModifierGroupsSelector
        groups={[sizeGroup]}
        selection={{ 'g-size': ['o-small'] }}
        onToggle={jest.fn()}
      />,
    )
    const large = screen.getByRole('button', { name: /Large/ })

    expect(large).not.toBeDisabled()
    expect(large).not.toHaveAttribute('aria-checked')
  })
})
