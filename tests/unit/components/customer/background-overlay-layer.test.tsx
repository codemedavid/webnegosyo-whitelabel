import { render, screen } from '@testing-library/react'
import { BackgroundOverlayLayer } from '@/components/customer/background-overlay-layer'

/**
 * BackgroundOverlayLayer — the storefront-wide custom background. Renders two
 * decorative, non-interactive layers pinned behind the page content: the
 * merchant's image (with its own opacity) and a tint overlay on top of it.
 */
describe('BackgroundOverlayLayer', () => {
  it('renders nothing when the tenant has no background image or overlay', () => {
    const { container } = render(<BackgroundOverlayLayer tenant={{ id: 't1' }} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a null tenant', () => {
    const { container } = render(<BackgroundOverlayLayer tenant={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the image layer with the resolved background styles', () => {
    render(
      <BackgroundOverlayLayer
        tenant={{
          background_image_url: 'https://cdn.example.com/bg.jpg',
          background_image_opacity: 50,
        }}
      />
    )

    const layer = screen.getByTestId('background-image-layer')

    expect(layer).toHaveStyle({
      backgroundImage: 'url("https://cdn.example.com/bg.jpg")',
      backgroundSize: 'cover',
      opacity: '0.5',
      position: 'fixed',
    })
  })

  it('hides the decorative layers from assistive tech and from pointer events', () => {
    render(<BackgroundOverlayLayer tenant={{ background_image_url: 'https://cdn.example.com/bg.jpg' }} />)

    const layer = screen.getByTestId('background-image-layer')

    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer).toHaveStyle({ pointerEvents: 'none' })
  })

  it('omits the overlay layer when no tint is configured', () => {
    render(<BackgroundOverlayLayer tenant={{ background_image_url: 'https://cdn.example.com/bg.jpg' }} />)

    expect(screen.queryByTestId('background-overlay-layer')).not.toBeInTheDocument()
  })

  it('renders the tint overlay above the image layer', () => {
    render(
      <BackgroundOverlayLayer
        tenant={{
          background_image_url: 'https://cdn.example.com/bg.jpg',
          background_overlay_color: '#112233',
          background_overlay_opacity: 50,
        }}
      />
    )

    expect(screen.getByTestId('background-overlay-layer')).toHaveStyle({
      backgroundColor: 'rgba(17, 34, 51, 0.5)',
    })
  })

  it('renders a tint-only background when no image is set', () => {
    render(
      <BackgroundOverlayLayer
        tenant={{ background_overlay_color: '#ff0000', background_overlay_opacity: 20 }}
      />
    )

    expect(screen.queryByTestId('background-image-layer')).not.toBeInTheDocument()
    expect(screen.getByTestId('background-overlay-layer')).toBeInTheDocument()
  })
})
