/**
 * Tap-to-edit panel pieces: breadcrumb navigation, settings search, and the
 * Edit / Try it switch.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { ComponentPanel, EditModeToggle, matchesSettingQuery } from '@/components/admin/branding-studio/component-panel'
import { componentBreadcrumb, getBrandingComponent } from '@/lib/branding-components'
import type { BrandingField } from '@/lib/branding-registry'

const field = (id: string, label: string): BrandingField => ({ id, label, type: 'color' })

describe('ComponentPanel', () => {
    it('shows only the selected element\'s settings and walks back up', () => {
        const component = getBrandingComponent('product/add-to-cart')!
        const onSelectScope = jest.fn()
        render(
            <ComponentPanel
                component={component}
                crumbs={componentBreadcrumb('product/add-to-cart')}
                fields={[field('add_to_cart_button_background', 'Add to Cart background')]}
                renderField={(f) => <div key={f.id}>{f.label}</div>}
                onSelectScope={onSelectScope}
            />,
        )

        expect(screen.getByText('Add to Cart background')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Sticky footer & actions' }))
        expect(onSelectScope).toHaveBeenCalledWith('product/sticky-footer')
        fireEvent.click(screen.getByRole('button', { name: 'Product Detail' }))
        expect(onSelectScope).toHaveBeenLastCalledWith(null)
    })
})

describe('matchesSettingQuery', () => {
    it('matches every word in any order, across label and id', () => {
        const priceColour = field('total_price_color', 'Total price')

        expect(matchesSettingQuery(priceColour, 'price total')).toBe(true)
        expect(matchesSettingQuery(priceColour, 'color')).toBe(true)
        expect(matchesSettingQuery(priceColour, 'checkmark')).toBe(false)
        expect(matchesSettingQuery(priceColour, '  ')).toBe(true)
    })
})

describe('EditModeToggle', () => {
    it('switches between editing and trying the store', () => {
        const onChange = jest.fn()
        render(<EditModeToggle isEditing onChange={onChange} />)

        expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(screen.getByRole('button', { name: 'Try it' }))
        expect(onChange).toHaveBeenCalledWith(false)
    })
})
