import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SearchBar } from '@/components/customer/search-bar'
import { DEFAULT_BRANDING, type BrandingColors } from '@/lib/branding-utils'

function makeBranding(overrides: Partial<BrandingColors['searchBar']> = {}): BrandingColors {
  return {
    ...DEFAULT_BRANDING,
    searchBar: { ...DEFAULT_BRANDING.searchBar, ...overrides },
  }
}

describe('SearchBar', () => {
  it('renders the input with the placeholder', () => {
    render(<SearchBar value="" onChange={() => {}} branding={makeBranding()} />)
    expect(screen.getByPlaceholderText('Search menu...')).toBeInTheDocument()
  })

  it('calls onChange when typing', () => {
    const onChange = jest.fn()
    render(<SearchBar value="" onChange={onChange} branding={makeBranding()} />)
    fireEvent.change(screen.getByPlaceholderText('Search menu...'), { target: { value: 'pizza' } })
    expect(onChange).toHaveBeenCalledWith('pizza')
  })

  it('applies pill radius by default', () => {
    render(<SearchBar value="" onChange={() => {}} branding={makeBranding()} />)
    expect(screen.getByPlaceholderText('Search menu...').className).toMatch(/rounded-full/)
  })

  it('applies square radius when configured', () => {
    render(<SearchBar value="" onChange={() => {}} branding={makeBranding({ radius: 'square' })} />)
    expect(screen.getByPlaceholderText('Search menu...').className).toMatch(/rounded-none/)
  })

  it('applies rounded radius when configured', () => {
    render(<SearchBar value="" onChange={() => {}} branding={makeBranding({ radius: 'rounded' })} />)
    expect(screen.getByPlaceholderText('Search menu...').className).toMatch(/rounded-lg/)
  })

  it('does not render an admin edit pencil (branding editing moved to Branding Studio)', () => {
    render(<SearchBar value="" onChange={() => {}} branding={makeBranding()} />)
    expect(screen.queryByRole('button', { name: /edit search bar/i })).toBeNull()
  })
})
