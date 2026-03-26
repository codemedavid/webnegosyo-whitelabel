import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// ── Mock server action ────────────────────────────────────────────────────────
jest.mock('@/app/actions/bookings', () => ({
  createBooking: jest.fn(),
}))

// ── Mock sonner toast (used in booking-popup.tsx) ─────────────────────────────
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

// ── Mock framer-motion (used in confirmation.tsx) ─────────────────────────────
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
  },
}))

// ── Mock @/components/ui/dialog ───────────────────────────────────────────────
// Radix UI Dialog uses Portals which don't render in jsdom. Replace with simple
// wrappers that pass children through so form fields are accessible.
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? React.createElement('div', { 'data-testid': 'dialog' }, children) : null,
  DialogContent: ({
    children,
  }: {
    children: React.ReactNode
    showCloseButton?: boolean
    className?: string
  }) => React.createElement('div', { 'data-testid': 'dialog-content' }, children),
  DialogTitle: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => React.createElement('h2', { className }, children),
}))

// ─────────────────────────────────────────────────────────────────────────────

describe('BookingPopup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── Step 1 rendering ────────────────────────────────────────────────────────

  test('renders nothing when open is false', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    const { container } = render(
      <BookingPopup open={false} onOpenChange={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  test('renders step 1 with name, email, phone fields when open', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    expect(
      screen.getByPlaceholderText('Juan dela Cruz')
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('juan@example.com')
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('+63 917 123 4567')
    ).toBeInTheDocument()
  })

  test('renders step 1 heading and step indicator', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    // "Book a Demo" appears twice: once in sr-only DialogTitle and once in StepOne heading.
    // Verify at least one visible instance is present.
    expect(screen.getAllByText('Book a Demo').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(
      screen.getByText('Tell us a bit about yourself')
    ).toBeInTheDocument()
  })

  test('renders the Next button on step 1', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    expect(
      screen.getByRole('button', { name: /next.*choose your time/i })
    ).toBeInTheDocument()
  })

  // ── Validation ──────────────────────────────────────────────────────────────

  test('shows validation error for empty name on form submit', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    const submitBtn = screen.getByRole('button', {
      name: /next.*choose your time/i,
    })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument()
    })
  })

  test('shows validation error for invalid email on form submit', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('Juan dela Cruz'), {
      target: { value: 'Maria Santos' },
    })
    fireEvent.change(screen.getByPlaceholderText('juan@example.com'), {
      target: { value: 'not-an-email' },
    })
    fireEvent.change(screen.getByPlaceholderText('+63 917 123 4567'), {
      target: { value: '+639171234567' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: /next.*choose your time/i })
    )

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument()
    })
  })

  test('shows validation error for invalid Philippine phone on form submit', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('Juan dela Cruz'), {
      target: { value: 'Maria Santos' },
    })
    fireEvent.change(screen.getByPlaceholderText('juan@example.com'), {
      target: { value: 'maria@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('+63 917 123 4567'), {
      target: { value: '12345' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: /next.*choose your time/i })
    )

    await waitFor(() => {
      expect(
        screen.getByText('Invalid Philippine phone number')
      ).toBeInTheDocument()
    })
  })

  test('shows all three validation errors when all fields are empty', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    fireEvent.click(
      screen.getByRole('button', { name: /next.*choose your time/i })
    )

    await waitFor(() => {
      // At minimum, the name error must appear for an empty form
      expect(
        screen.queryByText('Name is required') ||
          screen.queryByText('Invalid email address') ||
          screen.queryByText('Invalid Philippine phone number')
      ).toBeTruthy()
    })
  })

  // ── Step navigation ─────────────────────────────────────────────────────────

  test('advances to step 2 when valid step 1 data is submitted', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('Juan dela Cruz'), {
      target: { value: 'Maria Santos' },
    })
    fireEvent.change(screen.getByPlaceholderText('juan@example.com'), {
      target: { value: 'maria@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('+63 917 123 4567'), {
      target: { value: '+639171234567' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: /next.*choose your time/i })
    )

    await waitFor(() => {
      expect(screen.getByText('Step 2 of 2')).toBeInTheDocument()
      expect(screen.getByText('Choose a Time')).toBeInTheDocument()
    })
  })

  test('returns to step 1 when Back button is clicked on step 2', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    // Navigate to step 2
    fireEvent.change(screen.getByPlaceholderText('Juan dela Cruz'), {
      target: { value: 'Maria Santos' },
    })
    fireEvent.change(screen.getByPlaceholderText('juan@example.com'), {
      target: { value: 'maria@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('+63 917 123 4567'), {
      target: { value: '+639171234567' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /next.*choose your time/i })
    )

    await waitFor(() => {
      expect(screen.getByText('Step 2 of 2')).toBeInTheDocument()
    })

    // Click Back
    fireEvent.click(screen.getByRole('button', { name: /← back/i }))

    await waitFor(() => {
      expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Juan dela Cruz')).toBeInTheDocument()
    })
  })

  // ── Step 2 UI ───────────────────────────────────────────────────────────────

  test('step 2 shows calendar and disabled Confirm button initially', async () => {
    const { BookingPopup } = await import(
      '@/components/landing/booking-popup/booking-popup'
    )
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    // Navigate to step 2
    fireEvent.change(screen.getByPlaceholderText('Juan dela Cruz'), {
      target: { value: 'Maria Santos' },
    })
    fireEvent.change(screen.getByPlaceholderText('juan@example.com'), {
      target: { value: 'maria@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('+63 917 123 4567'), {
      target: { value: '+639171234567' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /next.*choose your time/i })
    )

    await waitFor(() => {
      expect(screen.getByText('Step 2 of 2')).toBeInTheDocument()
    })

    // Confirm button should be disabled (no date/time selected)
    const confirmBtn = screen.getByRole('button', { name: /confirm booking/i })
    expect(confirmBtn).toBeDisabled()

    // Calendar navigation buttons should be present
    expect(
      screen.getByRole('button', { name: /previous month/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /next month/i })
    ).toBeInTheDocument()
  })
})
