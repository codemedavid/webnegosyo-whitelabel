import { render, screen, waitFor } from '@testing-library/react'
import { MenuLayout } from '@/components/customer/layouts'
import { getTenantBranding } from '@/lib/branding-utils'
import { createTestMenuItem } from '../../fixtures/menu-item.fixture'
import type { MenuLayoutContentProps } from '@/storefront/contracts'

jest.mock('next/dynamic', () => {
  const React = jest.requireActual('react')
  return (load: () => Promise<unknown>) => {
    const Lazy = React.lazy(load)
    return function View(props: unknown) { return React.createElement(React.Suspense, { fallback: null }, React.createElement(Lazy, props)) }
  }
})
jest.mock('@/components/customer/layouts/layout-sidebar', () => ({ LayoutSidebar: ({ filteredItems }: MenuLayoutContentProps) => <div>{filteredItems.map(item => <span key={item.id}>{item.name}</span>)}</div> }))

it('uses search results for scrolling without erasing the category filter of other layouts', async () => {
  const main = createTestMenuItem({ id: 'main', name: 'Main', category_id: 'mains' })
  const drink = createTestMenuItem({ id: 'drink', name: 'Drink', category_id: 'drinks' })
  const setCategory = jest.fn()
  render(<MenuLayout layout="sidebar" tenant={null} tenantSlug="test" categories={[]}
    allMenuItems={[main, drink]} filteredItems={[main]} searchItems={[main, drink]}
    activeCategory="mains" setActiveCategory={setCategory} searchQuery="" setSearchQuery={jest.fn()}
    onItemSelect={jest.fn()} branding={getTenantBranding(null)} cardTemplate="classic"
    currentSlide={0} setCurrentSlide={jest.fn()} />)
  await waitFor(() => expect(screen.getByText('Drink')).toBeInTheDocument())
  expect(setCategory).not.toHaveBeenCalled()
})
