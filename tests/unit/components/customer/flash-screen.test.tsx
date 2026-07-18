import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FlashScreen } from '@/components/customer/flash-screen'
import type { Tenant } from '@/types/database'

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return { id: 'tenant-1', name: 'Mcbels', slug: 'mcbels', ...overrides } as unknown as Tenant
}

describe('FlashScreen', () => {
  it('renders the fallback title when the tenant has no configured flash title', () => {
    render(<FlashScreen tenant={null} tenantSlug="mcbels" fallbackTitle="Loading checkout..." />)
    expect(screen.getByText('Loading checkout...')).toBeInTheDocument()
  })

  it('defaults the fallback title to "Loading menu..." when none is passed', () => {
    render(<FlashScreen tenant={null} tenantSlug="mcbels" />)
    expect(screen.getByText('Loading menu...')).toBeInTheDocument()
  })

  it('prefers the tenant flash_screen_title over the fallback', () => {
    render(
      <FlashScreen
        tenant={makeTenant({ flash_screen_title: 'Welcome to Mcbels' })}
        tenantSlug="mcbels"
        fallbackTitle="Loading checkout..."
      />,
    )
    expect(screen.getByText('Welcome to Mcbels')).toBeInTheDocument()
    expect(screen.queryByText('Loading checkout...')).not.toBeInTheDocument()
  })

  it('renders the initial letter when there is no logo or flash image', () => {
    render(<FlashScreen tenant={null} tenantSlug="mcbels" />)
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('renders the brand image when a flash image or logo url is present', () => {
    render(
      <FlashScreen
        tenant={makeTenant({ flash_screen_image_url: 'https://cdn.example/logo.png' })}
        tenantSlug="mcbels"
      />,
    )
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://cdn.example/logo.png')
  })

  it('applies the tenant flash background and text colors', () => {
    render(
      <FlashScreen
        tenant={makeTenant({
          flash_screen_background_color: '#123456',
          flash_screen_text_color: '#abcdef',
        })}
        tenantSlug="mcbels"
      />,
    )
    const overlay = screen.getByTestId('flash-screen')
    expect(overlay).toHaveStyle({ backgroundColor: '#123456', color: '#abcdef' })
  })

  it('shows the subtitle only when provided', () => {
    const { rerender } = render(<FlashScreen tenant={null} tenantSlug="mcbels" />)
    expect(screen.queryByText('Please wait')).not.toBeInTheDocument()

    rerender(
      <FlashScreen
        tenant={makeTenant({ flash_screen_subtitle: 'Please wait' })}
        tenantSlug="mcbels"
      />,
    )
    expect(screen.getByText('Please wait')).toBeInTheDocument()
  })

  it('renders an accessible loading spinner', () => {
    render(<FlashScreen tenant={null} tenantSlug="mcbels" />)
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })
})
