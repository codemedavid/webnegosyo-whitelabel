export interface TimeSlot {
  time: string       // '09:00', '09:30', etc.
  label: string      // '9:00 AM', '9:30 AM', etc.
  available: boolean
}

export interface BookingFormData {
  name: string
  email: string
  phone: string
  bookingDate: string  // 'YYYY-MM-DD'
  bookingTime: string  // 'HH:mm'
}

export type BookingStep = 'contact' | 'time' | 'confirmation'
