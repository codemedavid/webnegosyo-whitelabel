/**
 * The merchant's own Lalamove card.
 *
 * A store that cannot book a rider fails at checkout, not here, so the card
 * has to say up front which of the three prerequisites — keys, pickup phone,
 * pickup pin — is missing. And a merchant editing only the phone must not be
 * made to re-enter credentials it can no longer read.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LalamoveSettingsCard } from '@/components/admin/lalamove-settings-card'

const updateLalamoveSettingsAction = jest.fn()

jest.mock('@/app/actions/staff', () => ({
  updateLalamoveSettingsAction: (...args: unknown[]) => updateLalamoveSettingsAction(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), back: jest.fn() }),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}))

function renderCard(overrides: Record<string, unknown> = {}) {
  return render(
    <LalamoveSettingsCard
      tenantId="tenant-1"
      tenantSlug="foodify"
      hasExistingKeys
      senderPhone="+639171234567"
      fallbackPhone=""
      pickupAddress="Pasay, Metro Manila"
      hasPickupCoordinates
      {...overrides}
    />
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  updateLalamoveSettingsAction.mockResolvedValue({ success: true })
})

describe('LalamoveSettingsCard', () => {
  test('shows the stored pickup phone so it can be corrected', () => {
    // Arrange / Act
    renderCard()

    // Assert
    expect(screen.getByLabelText(/pickup contact phone/i)).toHaveValue('+639171234567')
  })

  test('saves the phone without re-entering the stored keys', async () => {
    // Arrange
    const user = userEvent.setup()
    renderCard()

    // Act
    await user.clear(screen.getByLabelText(/pickup contact phone/i))
    await user.type(screen.getByLabelText(/pickup contact phone/i), '09053097280')
    await user.click(screen.getByRole('button', { name: /save lalamove settings/i }))

    // Assert
    expect(updateLalamoveSettingsAction).toHaveBeenCalledWith('tenant-1', 'foodify', {
      apiKey: '',
      secretKey: '',
      senderPhone: '09053097280',
    })
  })

  test('names an unpinned store location as the thing blocking delivery', () => {
    // Arrange / Act
    renderCard({ hasPickupCoordinates: false, pickupAddress: '' })

    // Assert
    expect(screen.getByText(/not pinned/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /set store location/i })).toHaveAttribute(
      'href',
      '/foodify/admin/settings#store-location'
    )
  })

  test('says the footer number is standing in when no pickup phone is set', () => {
    // Arrange / Act
    renderCard({ senderPhone: '', fallbackPhone: '+639170000000' })

    // Assert
    expect(screen.getByText(/using your footer phone \+639170000000/i)).toBeInTheDocument()
  })

  test('calls out a store with no number for the rider at all', () => {
    // Arrange / Act
    renderCard({ senderPhone: '', fallbackPhone: '' })

    // Assert
    expect(screen.getByText(/no number for the rider to call/i)).toBeInTheDocument()
  })

  test('reports a refused save instead of claiming success', async () => {
    // Arrange
    const user = userEvent.setup()
    const { toast } = jest.requireMock('sonner')
    updateLalamoveSettingsAction.mockResolvedValue({
      success: false,
      error: '"12" is not a valid mobile number. Enter your store number, e.g. 09171234567.',
    })
    renderCard()

    // Act
    await user.click(screen.getByRole('button', { name: /save lalamove settings/i }))

    // Assert
    expect(toast.error).toHaveBeenCalledWith(
      '"12" is not a valid mobile number. Enter your store number, e.g. 09171234567.'
    )
    expect(toast.success).not.toHaveBeenCalled()
  })
})
