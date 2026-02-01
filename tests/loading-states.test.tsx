/**
 * Unit tests for loading states
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { ProductDetailSkeleton } from '@/components/customer/product-detail-skeleton'
import ProductDetailLoading from '@/app/[tenant]/menu/item/[itemId]/loading'

describe('ProductDetailSkeleton', () => {
    it('should render without crashing', () => {
        const { container } = render(<ProductDetailSkeleton />)
        const skeletonContainer = container.querySelector('.min-h-screen')
        expect(skeletonContainer).toBeInTheDocument()
    })

    it('should render skeleton elements with correct structure', () => {
        render(<ProductDetailSkeleton />)

        // Check for header elements (back button and share button placeholders)
        const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    it('should have fixed header position', () => {
        const { container } = render(<ProductDetailSkeleton />)
        const header = container.querySelector('header.fixed')
        expect(header).toBeInTheDocument()
    })

    it('should have product image section', () => {
        const { container } = render(<ProductDetailSkeleton />)
        const imageSection = container.querySelector('.aspect-square')
        expect(imageSection).toBeInTheDocument()
    })

    it('should have product info section', () => {
        const { container } = render(<ProductDetailSkeleton />)
        const productInfo = container.querySelector('.px-5')
        expect(productInfo).toBeInTheDocument()
    })

    it('should have fixed footer position', () => {
        const { container } = render(<ProductDetailSkeleton />)
        const footer = container.querySelector('footer.fixed')
        expect(footer).toBeInTheDocument()
    })
})

describe('ProductDetailLoading', () => {
    it('should render ProductDetailSkeleton', () => {
        render(<ProductDetailLoading />)
        
        // The loading component should render the skeleton
        const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    it('should export a valid default component', () => {
        expect(ProductDetailLoading).toBeDefined()
        expect(typeof ProductDetailLoading).toBe('function')
        expect(ProductDetailLoading.name).toBe('ProductDetailLoading')
    })
})
