/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { LinkPicker, LinkSurfaceProvider } from '@/components/hero-builder/editor/inspector/link-picker'

function renderWelcomePicker(value: string) {
  const onChange = jest.fn()
  render(
    <LinkSurfaceProvider value="welcome">
      <LinkPicker value={value} onChange={onChange} sectionAnchors={[]} />
    </LinkSurfaceProvider>,
  )
  const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
  const optionValues = [...selects[0].options].map((o) => o.value).filter(Boolean)
  return { onChange, selects, optionValues }
}

describe('LinkPicker on the welcome page', () => {
  it('offers starting an order instead of menu, category and product links', () => {
    const { optionValues } = renderWelcomePicker('#welcome-start')
    expect(optionValues).toEqual(['start', 'order-type', 'url'])
  })

  it('stores a per-order-type link and lets the merchant change the type', () => {
    const { onChange, selects } = renderWelcomePicker('#welcome-start')
    fireEvent.change(selects[0], { target: { value: 'order-type' } })
    expect(onChange).toHaveBeenLastCalledWith('#welcome-mode-pickup')
  })

  it('shows the chosen order type of an existing link', () => {
    const { selects, onChange } = renderWelcomePicker('#welcome-mode-delivery')
    expect(selects[0].value).toBe('order-type')
    expect(selects[1].value).toBe('delivery')
    fireEvent.change(selects[1], { target: { value: 'dine_in' } })
    expect(onChange).toHaveBeenLastCalledWith('#welcome-mode-dine_in')
  })

  it('still shows a menu link carried over from a hero section', () => {
    const { selects, optionValues } = renderWelcomePicker('#storefront-menu')
    expect(selects[0].value).toBe('menu')
    expect(optionValues[0]).toBe('menu')
  })
})
