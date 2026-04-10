/**
 * Unit tests for ProductDetailContent component
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { ProductDetailContent } from '@/components/customer/product-detail-content'
import type { MenuItem, Category } from '@/types/database'
import type { SelectedTenant } from '@/lib/product-detail-data'
import type { BrandingColors } from '@/lib/branding-utils'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'

// Mock Next.js router
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        back: jest.fn(),
        push: jest.fn()
    })
}))

// Mock cart hook
jest.mock('@/hooks/useCart', () => ({
    useCart: () => ({
        addItem: jest.fn(),
        setTenantContext: jest.fn()
    })
}))

// Mock supabase client
jest.mock('@/lib/supabase/client', () => ({
    createClient: jest.fn(() => ({
        auth: {
            getUser: jest.fn().mockResolvedValue({ data: { user: null } })
        },
        from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null })
        })
    }))
}))

// Mock sonner toast
jest.mock('sonner', () => ({
    toast: {
        success: jest.fn(),
        error: jest.fn()
    }
}))

// Mock framer-motion - filter out animation-specific props
jest.mock('framer-motion', () => ({
    motion: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        button: ({ children, whileTap, whileHover, layout, initial, animate, exit, transition, ...props }: any) =>
            <button {...props}>{children}</button>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        div: ({ children, whileTap, whileHover, layout, initial, animate, exit, transition, ...props }: any) =>
            <div {...props}>{children}</div>,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AnimatePresence: ({ children }: any) => <>{children}</>
}))

// Mock lazy-loaded components to render synchronously in tests
jest.mock('@/components/customer/product-detail-lazy', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LazyImageModal: ({ isOpen, onOpenChange, imageUrl, itemName }: any) =>
        isOpen ? <div data-testid="image-modal">{itemName}</div> : null,
    LazyProductDetailCustomizer: () => null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LazyRelatedItemsSection: ({ relatedItems, tenantSlug }: any) => (
        <div>
            <h3>You might also like</h3>
            <div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {relatedItems.map((item: any) => (
                    <div key={item.id}>{item.name}</div>
                ))}
            </div>
        </div>
    )
}))

describe('ProductDetailContent', () => {
    const mockTenant: SelectedTenant = {
        id: 'tenant-1',
        slug: 'test-restaurant',
        name: 'Test Restaurant',
        logo_url: '',
        primary_color: '#3b82f6',
        secondary_color: '#64748b',
        background_color: '#ffffff',
        text_primary_color: '#111827',
        text_secondary_color: '#6b7280',
        border_color: '#e5e7eb',
        header_color: '#ffffff',
        cards_color: '#f9fafb',
        is_active: true
    }

    const mockBranding: BrandingColors = {
        primary: '#3b82f6',
        secondary: '#64748b',
        background: '#ffffff',
        header: '#ffffff',
        headerFont: '#374151',
        cards: '#f9fafb',
        cardsBorder: '#e5e7eb',
        cardTitle: '#111827',
        cardPrice: '#3b82f6',
        cardDescription: '#6b7280',
        modalBackground: '#ffffff',
        modalTitle: '#111827',
        modalPrice: '#3b82f6',
        modalDescription: '#6b7280',
        textPrimary: '#111827',
        textSecondary: '#6b7280',
        textMuted: '#9ca3af',
        border: '#e5e7eb',
        buttonPrimary: '#3b82f6',
        buttonPrimaryText: '#ffffff',
        buttonSecondary: '#ffffff',
        buttonSecondaryText: '#111827',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        link: '#3b82f6',
        shadow: 'rgba(0, 0, 0, 0.1)',
        accent: '#ffd700'
    }

    const createMockItem = (overrides?: Partial<MenuItem>): MenuItem => ({
        id: 'item-1',
        tenant_id: 'tenant-1',
        category_id: 'cat-1',
        name: 'Test Menu Item',
        description: 'A delicious test item',
        price: 10,
        discounted_price: undefined,
        image_url: 'https://example.com/image.jpg',
        variations: [],
        addons: [],
        is_available: true,
        created_at: '',
        updated_at: '',
        ...overrides
    })

    const mockCategory: Category = {
        id: 'cat-1',
        tenant_id: 'tenant-1',
        name: 'Main Course',
        created_at: '',
        updated_at: ''
    }

    it('should render basic item information', () => {
        const item = createMockItem()

        render(
            <ProductDetailContent
                tenant={mockTenant}
                item={item}
                branding={mockBranding}
            />
        )

        // Use getAllByText since text might appear multiple times (e.g., in title attributes)
        const titleElements = screen.getAllByText('Test Menu Item')
        expect(titleElements.length).toBeGreaterThan(0)
        const descElements = screen.getAllByText('A delicious test item')
        expect(descElements.length).toBeGreaterThan(0)
    })

    it('should render variations when provided', () => {
        const item = createMockItem({
            variations: [
                { id: 'var-1', name: 'Small', price_modifier: 0, is_default: true, menu_item_id: 'item-1', created_at: '', updated_at: '' },
                { id: 'var-2', name: 'Large', price_modifier: 5, is_default: false, menu_item_id: 'item-1', created_at: '', updated_at: '' }
            ]
        })

        render(
            <ProductDetailContent
                tenant={mockTenant}
                item={item}
                branding={mockBranding}
            />
        )

        expect(screen.getByText('Choose Size')).toBeInTheDocument()
        // Use getAllByText since text might appear multiple times
        const smallElements = screen.getAllByText('Small')
        expect(smallElements.length).toBeGreaterThan(0)
        const largeElements = screen.getAllByText('Large')
        expect(largeElements.length).toBeGreaterThan(0)
    })

    it('should render add-ons when provided', () => {
        const item = createMockItem({
            addons: [
                { id: 'addon-1', name: 'Extra Cheese', price: 2, menu_item_id: 'item-1', created_at: '', updated_at: '' },
                { id: 'addon-2', name: 'Bacon', price: 3, menu_item_id: 'item-1', created_at: '', updated_at: '' }
            ]
        })

        render(
            <ProductDetailContent
                tenant={mockTenant}
                item={item}
                branding={mockBranding}
            />
        )

        expect(screen.getByText(/Add-ons/)).toBeInTheDocument()
        expect(screen.getByText('Extra Cheese')).toBeInTheDocument()
        expect(screen.getByText('Bacon')).toBeInTheDocument()
    })

    it('should render related items when provided', () => {
        const item = createMockItem()
        const relatedItems: MenuItem[] = [
            { id: 'item-2', name: 'Related Item 1', price: 15, image_url: '', category_id: 'cat-1', tenant_id: 'tenant-1', is_available: true, description: '', variations: [], addons: [], created_at: '', updated_at: '' },
            { id: 'item-3', name: 'Related Item 2', price: 20, image_url: '', category_id: 'cat-1', tenant_id: 'tenant-1', is_available: true, description: '', variations: [], addons: [], created_at: '', updated_at: '' }
        ]

        render(
            <ProductDetailContent
                tenant={mockTenant}
                item={item}
                branding={mockBranding}
                relatedItems={relatedItems}
            />
        )

        expect(screen.getByText('You might also like')).toBeInTheDocument()
        expect(screen.getByText('Related Item 1')).toBeInTheDocument()
        expect(screen.getByText('Related Item 2')).toBeInTheDocument()
    })

    it('should render variation types (new system) when provided', () => {
        const item = createMockItem({
            variation_types: [
                {
                    id: 'vt-1',
                    name: 'Size',
                    is_required: true,
                    display_order: 0,
                    options: [
                        { id: 'vo-1', name: 'Small', price_modifier: 0, is_default: true, display_order: 0 },
                        { id: 'vo-2', name: 'Large', price_modifier: 5, is_default: false, display_order: 1 }
                    ]
                }
            ]
        })

        render(
            <ProductDetailContent
                tenant={mockTenant}
                item={item}
                branding={mockBranding}
            />
        )

        expect(screen.getByText('Size')).toBeInTheDocument()
        expect(screen.getByText('* Pick 1')).toBeInTheDocument()
        // Use getAllByText since text might appear multiple times
        const smallElements = screen.getAllByText('Small')
        expect(smallElements.length).toBeGreaterThan(0)
        const largeElements = screen.getAllByText('Large')
        expect(largeElements.length).toBeGreaterThan(0)
    })

    it('should render breadcrumbs with category', () => {
        const item = createMockItem()

        render(
            <ProductDetailContent
                tenant={mockTenant}
                item={item}
                branding={mockBranding}
                category={mockCategory}
            />
        )

        expect(screen.getByText('Home')).toBeInTheDocument()
        expect(screen.getByText('Menu')).toBeInTheDocument()
        expect(screen.getByText('Main Course')).toBeInTheDocument()
    })

    it('should apply custom branding colors', () => {
        const customBranding: BrandingColors = {
            ...mockBranding,
            primary: '#ff0000',
            textPrimary: '#00ff00'
        }
        const item = createMockItem()

        const { container } = render(
            <ProductDetailContent
                tenant={mockTenant}
                item={item}
                branding={customBranding}
            />
        )

        // Check that CSS variables are applied
        const mainDiv = container.firstChild as HTMLElement
        expect(mainDiv.style.getPropertyValue('--pd-primary')).toBe('#ff0000')
        expect(mainDiv.style.getPropertyValue('--pd-text-primary')).toBe('#00ff00')
    })

    it('should not infer a spicy tag from hot drinks', () => {
        const item = createMockItem({
            name: 'Hot Choco Mallows',
            description: 'Warm chocolate drink topped with marshmallows'
        })

        render(
            <ProductDetailContent
                tenant={mockTenant}
                item={item}
                branding={mockBranding}
            />
        )

        expect(screen.queryByText('Spicy')).not.toBeInTheDocument()
    })

    it('should render a spicy tag for explicitly spicy items', () => {
        const item = createMockItem({
            name: 'Hot Wings',
            description: 'Crispy chicken wings tossed in hot sauce'
        })

        render(
            <ProductDetailContent
                tenant={mockTenant}
                item={item}
                branding={mockBranding}
            />
        )

        expect(screen.getByText('Spicy')).toBeInTheDocument()
    })
})
