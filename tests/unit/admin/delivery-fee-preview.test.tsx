import { render, screen } from '@testing-library/react'
import { DeliveryFeePreview } from '@/components/admin/delivery-fee-preview'

describe('DeliveryFeePreview', () => {
  it('shows what a customer pays at points across the radius', () => {
    render(<DeliveryFeePreview perKm="7" minFee="55" radiusKm="10" />)

    expect(screen.getByText('2.5 km')).toBeInTheDocument()
    expect(screen.getByText('10 km')).toBeInTheDocument()
    expect(screen.getByText('₱70.00')).toBeInTheDocument()
    expect(screen.getByText(/Every delivery under 7\.9 km by road pays the ₱55\.00 minimum/)).toBeInTheDocument()
  })

  it('warns when no address can ever pay more than the minimum', () => {
    render(<DeliveryFeePreview perKm="15" minFee="50" radiusKm="3" />)

    expect(screen.getByRole('alert')).toHaveTextContent(/every delivery pays ₱50\.00/i)
  })

  it('renders nothing until the pricing is complete', () => {
    const { container } = render(<DeliveryFeePreview perKm="" minFee="50" radiusKm="3" />)

    expect(container).toBeEmptyDOMElement()
  })
})
