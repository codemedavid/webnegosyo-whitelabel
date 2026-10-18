/**
 * Storefront labels: the owner's wording replaces a component's own, and in
 * the Branding Studio preview the words are a tappable part of the page.
 */

import { render, screen } from '@testing-library/react'

const mockIsPreview = { current: false }
jest.mock('@/hooks/use-branding-preview', () => ({
    useBrandingPreviewColumns: <T,>(tenant: T) => tenant,
    useIsBrandingPreview: () => mockIsPreview.current,
}))

function renderLabel(tenant: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StorefrontLabelsProvider, StoreLabel } = require('@/components/customer/storefront-labels-provider') as typeof import('@/components/customer/storefront-labels-provider')
    return render(
        <StorefrontLabelsProvider tenant={tenant}>
            <h1><StoreLabel name="cart.title" fallback="Your Cart" /></h1>
        </StorefrontLabelsProvider>,
    )
}

describe('StoreLabel', () => {
    beforeEach(() => {
        mockIsPreview.current = false
    })

    it('shows the owner\'s wording', () => {
        renderLabel({ storefront_labels: { 'cart.title': 'Your tray' } })

        expect(screen.getByRole('heading')).toHaveTextContent('Your tray')
    })

    it('keeps the component\'s own wording when the owner set none', () => {
        renderLabel({})

        expect(screen.getByRole('heading')).toHaveTextContent('Your Cart')
    })

    it('adds no markup for customers', () => {
        renderLabel({})

        expect(screen.getByRole('heading').innerHTML).toBe('Your Cart')
    })

    it('is a tappable part in the Studio preview', () => {
        mockIsPreview.current = true
        renderLabel({})

        expect(screen.getByText('Your Cart')).toHaveAttribute('data-branding-scope', 'label/cart.title')
    })
})
