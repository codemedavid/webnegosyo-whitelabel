/**
 * The product page's option chips and add-on rows must read the colours the
 * Branding Studio edits: Variations → option/selected colours, Add-ons →
 * row/selected/price colours and the "Free" label. Before 2026-10-18 they read
 * variables nothing set, so a dark store's unselected options and add-on rows
 * rendered dark text on a dark page.
 */

import { render, screen } from '@testing-library/react'
import type { ModifierGroup } from '@/types/database'
import { AddonQuantityControl } from '@/components/customer/addon-quantity-control'
import { ModifierGroupsSelector } from '@/components/customer/modifier-groups-selector'

const sugarGroup: ModifierGroup = {
    id: 'g-sugar',
    name: 'Sugar level',
    display_order: 0,
    min_select: 1,
    max_select: 1,
    options: [
        { id: 'o-full', name: '100% full sugar', price_modifier: 0, display_order: 0 },
        { id: 'o-less', name: '75% less sugar', price_modifier: 0, display_order: 1 },
    ],
}

const sinkersGroup: ModifierGroup = {
    id: 'g-sinkers',
    name: 'Add-ons',
    display_order: 1,
    min_select: 0,
    max_select: null,
    selection_mode: 'quantity',
    options: [
        { id: 'o-pearl', name: 'Pearl', price_modifier: 10, display_order: 0 },
        { id: 'o-nata', name: 'Nata', price_modifier: 0, display_order: 1 },
    ],
}

function renderSelector() {
    render(
        <ModifierGroupsSelector
            groups={[sugarGroup, sinkersGroup]}
            selection={{ 'g-sugar': ['o-full'], 'g-sinkers': ['o-pearl'] }}
            onToggle={jest.fn()}
            onQuantityChange={jest.fn()}
            labels={{ rule: { required: 'Kailangan' }, freeLabel: 'Libre' }}
        />,
    )
}

describe('product detail option chips', () => {
    it('paints unselected chips with the Variations option colours', () => {
        renderSelector()

        const chip = screen.getByRole('button', { name: /75% less sugar/ })

        expect(chip.style.backgroundColor).toBe('var(--pd-variation-option-bg)')
        expect(chip.style.color).toBe('var(--pd-variation-option-text)')
        expect(chip.style.borderColor).toBe('var(--pd-variation-option-border, var(--border))')
    })

    it('paints the chosen chip with the Variations selected colours', () => {
        renderSelector()

        const chip = screen.getByRole('button', { name: /100% full sugar/ })

        expect(chip.style.backgroundColor).toBe('var(--pd-variation-selected-bg)')
        expect(chip.style.color).toBe('var(--pd-variation-selected-text)')
    })

    it('titles quantity groups with the Add-ons title colour', () => {
        renderSelector()

        const heading = screen.getByRole('heading', { name: 'Add-ons' })

        expect(heading.style.color).toBe('var(--pd-addon-title)')
    })

    it('gives the per-item hint the muted text colour', () => {
        renderSelector()

        const hint = screen.getByText(/Quantities are per item/)

        expect(hint.style.color).toBe('var(--pd-text-muted)')
    })

    it('uses the store\'s free label on ₱0 options and quantity rows', () => {
        renderSelector()

        expect(screen.getAllByText('Libre').length).toBeGreaterThanOrEqual(3)
        expect(screen.queryByText('No extra charge')).not.toBeInTheDocument()
    })

    it('uses the store\'s required label in the rule', () => {
        renderSelector()

        expect(screen.getByText('Kailangan — choose 1')).toBeInTheDocument()
    })

    it('colours unchosen option prices with the price modifier colour', () => {
        render(
            <ModifierGroupsSelector
                groups={[{ ...sugarGroup, options: [{ id: 'o-big', name: 'Big', price_modifier: 20, display_order: 0 }] }]}
                selection={{}}
                onToggle={jest.fn()}
            />,
        )

        expect(screen.getByText(/\+.*20/).style.color).toBe('var(--pd-variation-price)')
    })

    it('rounds chips with the store\'s chip radius', () => {
        renderSelector()

        expect(screen.getByRole('button', { name: /75% less sugar/ }).style.borderRadius).toBe('var(--pd-chip-radius, 0.5rem)')
    })
})

describe('AddonQuantityControl', () => {
    function rowFor(name: string): HTMLElement {
        const output = screen.getByRole('status', { name: `${name} quantity` })
        const row = output.closest('[data-addon-row]')
        if (!(row instanceof HTMLElement)) throw new Error('add-on row not found')
        return row
    }

    it('paints an unpicked row with the Add-ons row colours', () => {
        render(<AddonQuantityControl name="Pearl" price={10} quantity={0} onChange={jest.fn()} />)

        const row = rowFor('Pearl')

        expect(row.style.backgroundColor).toBe('var(--pd-addon-bg)')
        expect(row.style.color).toBe('var(--pd-addon-text)')
        expect(row.style.borderColor).toBe('var(--pd-addon-border, var(--border))')
    })

    it('paints a picked row with the Add-ons selected colours', () => {
        render(<AddonQuantityControl name="Pearl" price={10} quantity={2} onChange={jest.fn()} />)

        const row = rowFor('Pearl')

        expect(row.style.backgroundColor).toBe('var(--pd-addon-selected-bg)')
        expect(row.style.color).toBe('var(--pd-addon-selected-text)')
        expect(row.style.borderColor).toBe('var(--pd-addon-selected-border, var(--border))')
    })

    it('gives the steppers a visible border in the row colour', () => {
        render(<AddonQuantityControl name="Pearl" price={10} quantity={0} onChange={jest.fn()} />)

        const plus = screen.getByRole('button', { name: 'Increase Pearl' })

        expect(plus.style.borderColor).toBe('currentcolor')
    })

    it('shows the add-on price in the Add-ons price colour', () => {
        render(<AddonQuantityControl name="Pearl" price={10} quantity={0} onChange={jest.fn()} />)

        const price = screen.getByText(/each/)

        expect(price.style.color).toBe('var(--pd-addon-price)')
    })

    it('keeps a picked row\'s price in the picked text colour', () => {
        render(<AddonQuantityControl name="Pearl" price={10} quantity={1} onChange={jest.fn()} />)

        const price = screen.getByText(/each/)

        expect(price.style.color).toBe('')
    })

    it('labels a free add-on with the given free label', () => {
        render(<AddonQuantityControl name="Nata" price={0} quantity={0} onChange={jest.fn()} freeLabel="Libre" />)

        expect(screen.getByText('Libre')).toBeInTheDocument()
    })

    it('falls back to "Free" without a label', () => {
        render(<AddonQuantityControl name="Nata" price={0} quantity={0} onChange={jest.fn()} />)

        expect(screen.getByText('Free')).toBeInTheDocument()
    })
})

describe('outside the product page (edit-item modal)', () => {
    it('falls back to the UI border instead of the text colour', () => {
        render(<AddonQuantityControl name="Pearl" price={10} quantity={0} onChange={jest.fn()} />)

        const row = screen.getByRole('status', { name: 'Pearl quantity' }).closest('[data-addon-row]') as HTMLElement

        expect(row.style.borderColor).toBe('var(--pd-addon-border, var(--border))')
    })

    it('marks a picked row with a heavier border', () => {
        render(<AddonQuantityControl name="Pearl" price={10} quantity={1} onChange={jest.fn()} />)

        const row = screen.getByRole('status', { name: 'Pearl quantity' }).closest('[data-addon-row]') as HTMLElement

        expect(row.className).toContain('border-2')
    })
})
