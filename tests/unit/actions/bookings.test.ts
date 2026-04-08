import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const mockCreateLead = jest.fn()
jest.mock('@/lib/leads/leads-service', () => ({
  createLead: (...args: unknown[]) => mockCreateLead(...args),
}))

const mockCaptureBooking = jest.fn()
jest.mock('@/lib/posthog', () => ({
  captureBookingCreated: (...args: unknown[]) => mockCaptureBooking(...args),
}))

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getNextWeekdayDate(): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)

  do {
    date.setUTCDate(date.getUTCDate() + 1)
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6)

  return formatDate(date)
}

function getNextSaturdayDate(): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)

  do {
    date.setUTCDate(date.getUTCDate() + 1)
  } while (date.getUTCDay() !== 6)

  return formatDate(date)
}

describe('createBooking server action', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns validation errors for invalid input', async () => {
    const { createBooking } = await import('@/app/actions/bookings')
    const result = await createBooking({
      name: '',
      email: 'not-an-email',
      phone: '123',
      bookingDate: getNextSaturdayDate(),
      bookingTime: '9am',
    })
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  test('returns success and calls PostHog on valid input', async () => {
    const bookingDate = getNextWeekdayDate()

    mockCreateLead.mockResolvedValueOnce({
      data: {
        id: 'lead-1',
        name: 'Maria Santos',
        email: 'maria@email.com',
        phone: '+639171234567',
        booking_date: bookingDate,
        booking_time: '10:00',
        source: 'landing_page',
      },
      error: null,
    })
    mockCaptureBooking.mockResolvedValueOnce(undefined)

    const { createBooking } = await import('@/app/actions/bookings')
    const result = await createBooking({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
      bookingDate,
      bookingTime: '10:00',
    })

    expect(result.success).toBe(true)
    expect(result.lead).toBeDefined()
    expect(mockCaptureBooking).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'maria@email.com', leadId: 'lead-1' })
    )
  })

  test('returns slot_taken error when slot is booked', async () => {
    const bookingDate = getNextWeekdayDate()

    mockCreateLead.mockResolvedValueOnce({ data: null, error: 'slot_taken' })

    const { createBooking } = await import('@/app/actions/bookings')
    const result = await createBooking({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
      bookingDate,
      bookingTime: '10:00',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('slot_taken')
    expect(mockCaptureBooking).not.toHaveBeenCalled()
  })
})
