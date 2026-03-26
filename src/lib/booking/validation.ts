import { z } from 'zod'
import { isWeekday } from './slots'

function isValidBookingDate(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00Z')
  if (isNaN(date.getTime())) return false
  if (!isWeekday(date)) return false

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const bookingDate = new Date(dateStr + 'T00:00:00Z')

  return bookingDate >= today
}

export const bookingStepOneSchema = z.object({
  name: z.string().min(2, 'Name is required').max(100, 'Name is too long'),
  email: z.string().email('Invalid email address'),
  phone: z
    .string()
    .transform(val => val.replace(/[\s\-()]/g, ''))
    .pipe(z.string().regex(/^(\+63|0)\d{9,11}$/, 'Invalid Philippine phone number')),
})

export const bookingStepTwoSchema = z.object({
  bookingDate: z.string().refine(isValidBookingDate, 'Must be a future weekday'),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
})

export const bookingSchema = bookingStepOneSchema.merge(bookingStepTwoSchema)

export type BookingStepOneData = z.infer<typeof bookingStepOneSchema>
export type BookingStepTwoData = z.infer<typeof bookingStepTwoSchema>
export type BookingData = z.infer<typeof bookingSchema>
