import { render, screen, fireEvent } from '@testing-library/react'
import { HeroPresetSection } from '@/components/customer/hero-preset'

/**
 * The storefront hero presets must faithfully reproduce the 6 hero templates
 * from the reference design (Restaurant Storefront.dc.html): an uppercase
 * kicker, 1–2 CTA buttons, decorative tiles carrying the brand initial, and —
 * on the split hero — a featured-product badge. Presets stay additive: any
 * piece of content that is blank simply does not render.
 */

const baseProps = {
  title: 'Sunset Kitchen',
  description: 'Fresh plates, wood-fired daily.',
  titleColor: '#1D1815',
  descriptionColor: '#8A7B70',
  accentColor: '#E4572E',
}

describe('HeroPresetSection — rich templates', () => {
  it('editorial renders kicker, title, description and both CTA buttons', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="editorial"
        kicker="Now serving"
        ctaPrimaryLabel="Order Now"
        ctaSecondaryLabel="View Menu"
      />
    )
    expect(screen.getByText('Now serving')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sunset Kitchen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Order Now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View Menu' })).toBeInTheDocument()
  })

  it('minimal renders a single primary CTA and no secondary CTA', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="minimal"
        ctaPrimaryLabel="Order Now"
      />
    )
    expect(screen.getByRole('button', { name: 'Order Now' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View Menu' })).not.toBeInTheDocument()
  })

  it('banner renders both CTAs inside the accent band', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="banner"
        ctaPrimaryLabel="Order Now"
        ctaSecondaryLabel="Book a table"
      />
    )
    expect(screen.getByRole('button', { name: 'Order Now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book a table' })).toBeInTheDocument()
  })

  it('split renders a decorative tile carrying the brand initial', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="split"
        brandInitial="S"
        ctaPrimaryLabel="Order Now"
      />
    )
    expect(screen.getByTestId('hero-tile-initial')).toHaveTextContent('S')
  })

  it('collage renders two decorative tiles', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="collage"
        brandInitial="S"
        ctaPrimaryLabel="Order Now"
      />
    )
    expect(screen.getAllByTestId('hero-tile-initial').length).toBeGreaterThanOrEqual(2)
  })

  it('centered renders a decorative tile band', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="centered"
        brandInitial="S"
        ctaPrimaryLabel="Order Now"
      />
    )
    expect(screen.getAllByTestId('hero-tile-initial').length).toBeGreaterThanOrEqual(1)
  })

  it('split shows the featured product name and price when one is set', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="split"
        brandInitial="S"
        ctaPrimaryLabel="Order Now"
        featuredProduct={{ name: 'Wood-fired Margherita', priceLabel: '₱320' }}
      />
    )
    const badge = screen.getByTestId('hero-featured-product')
    expect(badge).toHaveTextContent('Wood-fired Margherita')
    expect(badge).toHaveTextContent('₱320')
  })

  it('split omits the featured badge when no product is set (no fake rating)', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="split"
        brandInitial="S"
        ctaPrimaryLabel="Order Now"
      />
    )
    expect(screen.queryByTestId('hero-featured-product')).not.toBeInTheDocument()
    expect(screen.queryByText(/reviews/i)).not.toBeInTheDocument()
  })

  it('omits the kicker element entirely when kicker is blank', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="editorial"
        ctaPrimaryLabel="Order Now"
      />
    )
    expect(screen.queryByTestId('hero-kicker')).not.toBeInTheDocument()
  })

  it('renders no CTA button when no CTA label is provided', () => {
    render(<HeroPresetSection {...baseProps} preset="editorial" />)
    // Only affordance that may exist is the edit pencil (not shown here).
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('invokes onPrimaryCta when the primary button is clicked', () => {
    const onPrimaryCta = jest.fn()
    render(
      <HeroPresetSection
        {...baseProps}
        preset="minimal"
        ctaPrimaryLabel="Order Now"
        onPrimaryCta={onPrimaryCta}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Order Now' }))
    expect(onPrimaryCta).toHaveBeenCalledTimes(1)
  })
})

/**
 * Featured-product media panel: the decorative hero tile becomes a real product
 * card — product image, price, an Add button, and a click that opens the product
 * — reused across split/collage/centered. When no product is attached but a
 * fallback image + link are set, the tile becomes that image as a clickable
 * link. With neither, it stays the decorative brand-initial tile.
 */
describe('HeroPresetSection — featured product media panel', () => {
  const featured = {
    name: 'Wood-fired Margherita',
    priceLabel: '₱320',
    imageUrl: 'https://img.example/margherita.jpg',
  }

  it('split renders the product image, price and an Add button when a product with an image is attached', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="split"
        brandInitial="S"
        featuredProduct={{ ...featured, onSelect: jest.fn() }}
      />
    )
    const img = screen.getByRole('img', { name: 'Wood-fired Margherita' })
    expect(img).toHaveAttribute('src', featured.imageUrl)
    expect(screen.getByTestId('hero-featured-product')).toHaveTextContent('₱320')
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument()
  })

  it('invokes onSelect when the Add button is clicked', () => {
    const onSelect = jest.fn()
    render(
      <HeroPresetSection
        {...baseProps}
        preset="split"
        brandInitial="S"
        featuredProduct={{ ...featured, onSelect }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('invokes onSelect when the product image is clicked (opens the product)', () => {
    const onSelect = jest.fn()
    render(
      <HeroPresetSection
        {...baseProps}
        preset="split"
        brandInitial="S"
        featuredProduct={{ ...featured, onSelect }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /view wood-fired margherita/i }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('renders the fallback image as a clickable link when no product is attached', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="split"
        brandInitial="S"
        fallbackMedia={{ imageUrl: 'https://img.example/promo.jpg', linkUrl: '/sunset/menu/item/abc' }}
      />
    )
    const link = screen.getByRole('link', { name: /featured/i })
    expect(link).toHaveAttribute('href', '/sunset/menu/item/abc')
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://img.example/promo.jpg')
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })

  it('sanitizes an unsafe javascript: link on the fallback image', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="split"
        brandInitial="S"
        // eslint-disable-next-line no-script-url
        fallbackMedia={{ imageUrl: 'https://img.example/promo.jpg', linkUrl: 'javascript:alert(1)' }}
      />
    )
    const link = screen.queryByRole('link', { name: /featured/i })
    // Unsafe scheme is dropped — either no link or a neutralized href.
    expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript:/i)
  })

  it('keeps the decorative brand-initial tile when neither product nor fallback image is set', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="split"
        brandInitial="S"
      />
    )
    expect(screen.getByTestId('hero-tile-initial')).toHaveTextContent('S')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('collage shows the attached product image in its main tile', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="collage"
        brandInitial="S"
        featuredProduct={{ ...featured, onSelect: jest.fn() }}
      />
    )
    expect(screen.getByRole('img', { name: 'Wood-fired Margherita' })).toBeInTheDocument()
  })

  it('centered shows the attached product image in its main tile', () => {
    render(
      <HeroPresetSection
        {...baseProps}
        preset="centered"
        brandInitial="S"
        featuredProduct={{ ...featured, onSelect: jest.fn() }}
      />
    )
    expect(screen.getByRole('img', { name: 'Wood-fired Margherita' })).toBeInTheDocument()
  })
})
