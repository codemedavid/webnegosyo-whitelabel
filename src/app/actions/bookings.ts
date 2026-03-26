'use server'

import { bookingSchema } from '@/lib/booking/validation'
import { createLead } from '@/lib/leads/leads-service'
import { captureBookingCreated } from '@/lib/posthog'

interface BookingResult {
  success: boolean
  lead?: { id: string; name: string; bookingDate: string; bookingTime: string }
  error?: string
  errors?: Record<string, string[]>
}

export async function createBooking(input: {
  name: string
  email: string
  phone: string
  bookingDate: string
  bookingTime: string
}): Promise<BookingResult> {
  // 1. Validate
  const parsed = bookingSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString() || 'unknown'
      if (!fieldErrors[field]) fieldErrors[field] = []
      fieldErrors[field].push(issue.message)
    }
    return { success: false, errors: fieldErrors }
  }

  // 2. Insert (unique index prevents double-booking)
  const { data: lead, error } = await createLead({
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    bookingDate: parsed.data.bookingDate,
    bookingTime: parsed.data.bookingTime,
  })

  if (error) {
    return { success: false, error }
  }

  if (!lead) {
    return { success: false, error: 'server_error' }
  }

  // 3. PostHog (fire-and-forget)
  try {
    await captureBookingCreated({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      bookingDate: lead.booking_date,
      bookingTime: lead.booking_time,
      leadId: lead.id,
      source: lead.source || 'landing_page',
    })
  } catch {
    // Silent — booking succeeded, just no email
  }

  // 4. Return success
  return {
    success: true,
    lead: {
      id: lead.id,
      name: lead.name,
      bookingDate: lead.booking_date,
      bookingTime: lead.booking_time,
    },
  }
}
