/**
 * @jest-environment jsdom
 */
import { fireEvent, render } from '@testing-library/react'

import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { HeroLinkProvider } from '@/components/hero-builder/renderer/link-context'
import { createSection, createWidget } from '@/lib/hero-builder/defaults'
import type { LinkTarget } from '@/lib/hero-builder/link-target'
import type { HeroDesignV5, Widget, WidgetContent } from '@/lib/hero-builder/types'

import { designOf } from './helpers'

function designWithButton(href: string, newTab = false): HeroDesignV5 {
  const content: WidgetContent = {
    kind: 'buttons',
    items: [{ id: 'b1', label: 'Go', href, newTab, variant: 'solid' }],
  }
  const widget: Widget = { ...createWidget('buttons'), content }
  const section = createSection([100])
  return designOf([{ ...section, columns: [{ ...section.columns[0], widgets: [widget] }] }])
}

function renderWithHandler(design: HeroDesignV5, handler: (target: LinkTarget) => boolean) {
  return render(
    <HeroLinkProvider value={handler}>
      <HeroBuilderRenderer design={design} />
    </HeroLinkProvider>,
  )
}

describe('Hero links — storefront routing', () => {
  it.each([
    ['#storefront-menu', { type: 'menu' }],
    ['#category-cat-1', { type: 'category', categoryId: 'cat-1' }],
    ['#product-item-1', { type: 'product', itemId: 'item-1' }],
  ])('hands %s to the storefront instead of following it', (href, expected) => {
    // Arrange
    const handler = jest.fn(() => true)
    const { getByText } = renderWithHandler(designWithButton(href), handler)

    // Act
    const event = fireEvent.click(getByText('Go'))

    // Assert
    expect(handler).toHaveBeenCalledWith(expected)
    expect(event).toBe(false) // default prevented
  })

  it('lets the browser follow a web link', () => {
    // Arrange
    const handler = jest.fn(() => true)
    const { getByText } = renderWithHandler(designWithButton('https://x.com'), handler)

    // Act
    const event = fireEvent.click(getByText('Go'))

    // Assert
    expect(handler).not.toHaveBeenCalled()
    expect(event).toBe(true)
  })

  it('leaves a modified click (open in new tab) to the browser', () => {
    // Arrange
    const handler = jest.fn(() => true)
    const { getByText } = renderWithHandler(designWithButton('#category-cat-1'), handler)

    // Act
    const event = fireEvent.click(getByText('Go'), { metaKey: true })

    // Assert
    expect(handler).not.toHaveBeenCalled()
    expect(event).toBe(true)
  })

  it('never opens an in-store target in a new tab', () => {
    // Arrange / Act
    const { getByText } = renderWithHandler(designWithButton('#product-item-1', true), jest.fn(() => true))

    // Assert
    expect(getByText('Go').closest('a')).not.toHaveAttribute('target')
  })

  it('routes markup links in text through the storefront too', () => {
    // Arrange
    const handler = jest.fn(() => true)
    const widget: Widget = { ...createWidget('text'), content: { kind: 'text', text: 'See [our coffee](#category-coffee)' } }
    const section = createSection([100])
    const design = designOf([{ ...section, columns: [{ ...section.columns[0], widgets: [widget] }] }])
    const { getByText } = renderWithHandler(design, handler)

    // Act
    fireEvent.click(getByText('our coffee'))

    // Assert
    expect(handler).toHaveBeenCalledWith({ type: 'category', categoryId: 'coffee' })
  })

  it('falls back to scrolling to the element when no storefront is listening', () => {
    // Arrange
    const scrollIntoView = jest.fn()
    const target = document.createElement('div')
    target.id = 'category-cat-1'
    target.scrollIntoView = scrollIntoView
    document.body.appendChild(target)
    const { getByText } = render(<HeroBuilderRenderer design={designWithButton('#category-cat-1')} />)

    // Act
    const event = fireEvent.click(getByText('Go'))

    // Assert
    expect(scrollIntoView).toHaveBeenCalled()
    expect(event).toBe(false)
    target.remove()
  })
})
