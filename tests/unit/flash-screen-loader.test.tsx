import { render, screen } from '@testing-library/react'
import {
  FlashScreenLoader,
  TenantFlashLoading,
  TenantFlashProvider,
} from '@/components/customer/flash-screen-loader'
import type { FlashScreenBranding } from '@/lib/flash-loader'

const branding: FlashScreenBranding = {
  title: 'Warming the oven…',
  subtitle: 'One moment',
  imageUrl: 'https://cdn/flash.png',
  initial: 'B',
  backgroundColor: '#0a0a0a',
  textColor: '#fafafa',
}

describe('FlashScreenLoader', () => {
  it('renders the branded title, subtitle and image', () => {
    render(<FlashScreenLoader branding={branding} />)

    expect(screen.getByText('Warming the oven…')).toBeInTheDocument()
    expect(screen.getByText('One moment')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn/flash.png')
  })

  it('exposes an accessible loading status for screen readers', () => {
    render(<FlashScreenLoader branding={branding} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows the initial letter when there is no image', () => {
    render(<FlashScreenLoader branding={{ ...branding, imageUrl: null }} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})

describe('TenantFlashLoading', () => {
  it('renders the branded flash when the provider supplies branding', () => {
    render(
      <TenantFlashProvider branding={branding}>
        <TenantFlashLoading fallback={<div>skeleton</div>} />
      </TenantFlashProvider>,
    )

    expect(screen.getByText('Warming the oven…')).toBeInTheDocument()
    expect(screen.queryByText('skeleton')).not.toBeInTheDocument()
  })

  it('renders the fallback skeleton when the flash screen is disabled (no branding)', () => {
    render(
      <TenantFlashProvider branding={null}>
        <TenantFlashLoading fallback={<div>skeleton</div>} />
      </TenantFlashProvider>,
    )

    expect(screen.getByText('skeleton')).toBeInTheDocument()
    expect(screen.queryByText('Warming the oven…')).not.toBeInTheDocument()
  })

  it('renders the fallback when used outside any provider (zero-regression default)', () => {
    render(<TenantFlashLoading fallback={<div>skeleton</div>} />)
    expect(screen.getByText('skeleton')).toBeInTheDocument()
  })
})
