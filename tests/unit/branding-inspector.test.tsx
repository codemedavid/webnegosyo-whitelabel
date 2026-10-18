import { render, screen, fireEvent, act } from '@testing-library/react'
import { BrandingInspector } from '@/components/customer/branding-inspector'
import {
  BRANDING_INSPECT_MODE_MESSAGE,
  BRANDING_SCOPE_SELECTED_MESSAGE,
  BRANDING_SCOPE_ATTRIBUTE,
  BRANDING_SELECT_MESSAGE,
  BRANDING_FIELD_HOVER_MESSAGE,
} from '@/lib/branding-inspect'

/**
 * Iframe-side inspector for the Branding Studio's click-to-inspect feature.
 * Mounted on storefront pages; dormant until the editor posts an
 * inspect-mode message. While active it highlights hovered regions tagged
 * with data-branding-scope and, on click, swallows the click (so links and
 * buttons don't fire) and reports the scope key back to the editor window.
 */

function postInspectMode(enabled: boolean, origin: string = window.location.origin) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: BRANDING_INSPECT_MODE_MESSAGE, enabled },
        origin,
      })
    )
  })
}

function renderTaggedStorefront(onRegionClick?: () => void) {
  return render(
    <>
      <BrandingInspector />
      <header {...{ [BRANDING_SCOPE_ATTRIBUTE]: 'storefront/header' }}>
        <button type="button" onClick={onRegionClick} data-testid="header-button">
          Cart
        </button>
      </header>
      <div data-testid="untagged">Plain content</div>
    </>
  )
}

let postMessageSpy: jest.SpyInstance

beforeEach(() => {
  // In jsdom window.parent === window, so spying on window.postMessage
  // observes what the inspector sends to the editor.
  postMessageSpy = jest.spyOn(window, 'postMessage').mockImplementation(() => {})
})

afterEach(() => {
  postMessageSpy.mockRestore()
})

describe('BrandingInspector', () => {
  it('renders no highlight while inspect mode is off', () => {
    renderTaggedStorefront()
    fireEvent.mouseOver(screen.getByTestId('header-button'))
    expect(screen.queryByTestId('branding-inspector-highlight')).not.toBeInTheDocument()
  })

  it('highlights a tagged region with its scope label when hovered', () => {
    renderTaggedStorefront()
    postInspectMode(true)

    fireEvent.mouseOver(screen.getByTestId('header-button'))

    const highlight = screen.getByTestId('branding-inspector-highlight')
    expect(highlight).toBeInTheDocument()
    expect(highlight).toHaveTextContent('Header')
  })

  it('shows no highlight when hovering untagged content', () => {
    renderTaggedStorefront()
    postInspectMode(true)

    fireEvent.mouseOver(screen.getByTestId('untagged'))

    expect(screen.queryByTestId('branding-inspector-highlight')).not.toBeInTheDocument()
  })

  it('reports the scope to the editor and swallows the click', () => {
    const onRegionClick = jest.fn()
    renderTaggedStorefront(onRegionClick)
    postInspectMode(true)

    fireEvent.click(screen.getByTestId('header-button'))

    expect(onRegionClick).not.toHaveBeenCalled()
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: BRANDING_SCOPE_SELECTED_MESSAGE, scope: 'storefront/header' },
      window.location.origin
    )
  })

  it('lets clicks through and clears the highlight when inspect mode turns off', () => {
    const onRegionClick = jest.fn()
    renderTaggedStorefront(onRegionClick)
    postInspectMode(true)
    fireEvent.mouseOver(screen.getByTestId('header-button'))
    expect(screen.getByTestId('branding-inspector-highlight')).toBeInTheDocument()

    postInspectMode(false)

    expect(screen.queryByTestId('branding-inspector-highlight')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('header-button'))
    expect(onRegionClick).toHaveBeenCalledTimes(1)
    expect(postMessageSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: BRANDING_SCOPE_SELECTED_MESSAGE }),
      expect.anything()
    )
  })

  it('ignores inspect-mode messages from other origins', () => {
    renderTaggedStorefront()
    postInspectMode(true, 'https://evil.example')

    fireEvent.mouseOver(screen.getByTestId('header-button'))

    expect(screen.queryByTestId('branding-inspector-highlight')).not.toBeInTheDocument()
  })

  it('clears the current highlight on Escape', () => {
    renderTaggedStorefront()
    postInspectMode(true)
    fireEvent.mouseOver(screen.getByTestId('header-button'))
    expect(screen.getByTestId('branding-inspector-highlight')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('branding-inspector-highlight')).not.toBeInTheDocument()
  })
})

describe('BrandingInspector selection and field hover (tap-to-edit)', () => {
  function post(data: Record<string, unknown>) {
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin }))
    })
  }

  function renderProductPage() {
    return render(
      <>
        <BrandingInspector />
        <div {...{ [BRANDING_SCOPE_ATTRIBUTE]: 'product/sticky-footer' }}>
          <button type="button" {...{ [BRANDING_SCOPE_ATTRIBUTE]: 'product/add-to-cart' }}>Add To Cart</button>
          <button type="button" {...{ [BRANDING_SCOPE_ATTRIBUTE]: 'product/buy-now' }}>Buy Now</button>
        </div>
      </>
    )
  }

  it('outlines the component the Studio has selected', () => {
    renderProductPage()

    post({ type: BRANDING_SELECT_MESSAGE, scope: 'product/add-to-cart' })

    expect(screen.getByTestId('branding-inspector-selection')).toHaveTextContent('Add to Cart button')
  })

  it('clears the selection outline', () => {
    renderProductPage()
    post({ type: BRANDING_SELECT_MESSAGE, scope: 'product/add-to-cart' })

    post({ type: BRANDING_SELECT_MESSAGE, scope: null })

    expect(screen.queryByTestId('branding-inspector-selection')).not.toBeInTheDocument()
  })

  it('outlines everything a hovered setting changes', () => {
    renderProductPage()

    post({ type: BRANDING_FIELD_HOVER_MESSAGE, surfaceId: 'product', fieldId: 'add_to_cart_button_background' })

    // The button it changes — not the whole footer section around it.
    expect(screen.getAllByTestId('branding-inspector-field-hover')).toHaveLength(1)
  })

  it('ignores selection messages from other origins', () => {
    renderProductPage()

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: BRANDING_SELECT_MESSAGE, scope: 'product/add-to-cart' },
        origin: 'https://evil.example',
      }))
    })

    expect(screen.queryByTestId('branding-inspector-selection')).not.toBeInTheDocument()
  })
})
