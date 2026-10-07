/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { LinkCatalogProvider, LinkPicker } from '@/components/hero-builder/editor/inspector/link-picker'
import type { LinkCatalog } from '@/lib/hero-builder/link-catalog'

const catalog: LinkCatalog = {
  categories: [
    { id: 'mains', name: 'Mains' },
    { id: 'drinks', name: 'Drinks' },
  ],
  products: [
    { id: 'adobo', name: 'Adobo', categoryName: 'Mains' },
    { id: 'tea', name: 'Iced Tea', categoryName: 'Drinks' },
  ],
}

function renderPicker(value: string, props: Partial<Parameters<typeof LinkPicker>[0]> = {}) {
  const onChange = jest.fn()
  const view = render(
    <LinkCatalogProvider value={catalog}>
      <LinkPicker value={value} onChange={onChange} sectionAnchors={['promo']} {...props} />
    </LinkCatalogProvider>,
  )
  const [modeSelect] = screen.getAllByRole('combobox')
  return { ...view, onChange, modeSelect }
}

describe('LinkPicker', () => {
  it('shows a stored category link as the category it points at', () => {
    // Arrange / Act
    renderPicker('#category-drinks')

    // Assert
    const [mode, category] = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(mode.value).toBe('category')
    expect(category.value).toBe('drinks')
  })

  it('links to the first category when switching to "A category"', () => {
    // Arrange
    const { onChange, modeSelect } = renderPicker('#storefront-menu')

    // Act
    fireEvent.change(modeSelect, { target: { value: 'category' } })

    // Assert
    expect(onChange).toHaveBeenCalledWith('#category-mains')
  })

  it('picks a product from the list', () => {
    // Arrange
    const { onChange } = renderPicker('#product-adobo')
    const productSelect = screen.getAllByRole('combobox')[1]

    // Act
    fireEvent.change(productSelect, { target: { value: 'tea' } })

    // Assert
    expect(onChange).toHaveBeenCalledWith('#product-tea')
  })

  it('narrows the product list by search', () => {
    // Arrange
    renderPicker('#product-adobo')

    // Act
    fireEvent.change(screen.getByPlaceholderText('Search products…'), { target: { value: 'tea' } })

    // Assert: the current choice stays listed, the search adds the match
    const options = [...(screen.getAllByRole('combobox')[1] as HTMLSelectElement).options].map((o) => o.value)
    expect(options).toEqual(['adobo', 'tea'])
  })

  it('flags a product that is no longer on the menu', () => {
    // Arrange / Act
    renderPicker('#product-deleted')

    // Assert
    expect(screen.getByText(/no longer on your menu/)).toBeInTheDocument()
  })

  it('keeps web-address mode while the address is still blank', () => {
    // Arrange
    const { modeSelect, rerender, onChange } = renderPicker('#storefront-menu', { onNewTabChange: jest.fn() })

    // Act
    fireEvent.change(modeSelect, { target: { value: 'url' } })
    rerender(
      <LinkCatalogProvider value={catalog}>
        <LinkPicker value="" onChange={onChange} sectionAnchors={['promo']} onNewTabChange={jest.fn()} />
      </LinkCatalogProvider>,
    )

    // Assert
    expect(onChange).toHaveBeenCalledWith('')
    expect(screen.getByPlaceholderText('https://')).toBeInTheDocument()
    expect(screen.getByText('Open in new tab')).toBeInTheDocument()
  })

  it('offers "No link" only for optional links', () => {
    // Arrange / Act
    const { modeSelect } = renderPicker('', { allowNone: true })

    // Assert
    expect((modeSelect as HTMLSelectElement).value).toBe('none')
  })

  it('does not offer targets with nothing to pick', () => {
    // Arrange / Act
    const { modeSelect } = renderPicker('#storefront-menu', { sectionAnchors: [] })

    // Assert
    const modes = [...(modeSelect as HTMLSelectElement).options].map((o) => o.value)
    expect(modes).toEqual(['menu', 'category', 'product', 'url'])
  })
})
