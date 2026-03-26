'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { StepOne } from './step-one'
import { StepTwo } from './step-two'
import { Confirmation } from './confirmation'
import { createBooking } from '@/app/actions/bookings'
import type { BookingStepOneData } from '@/lib/booking/validation'
import type { BookingFormData, BookingStep } from '@/lib/booking/types'

interface BookingPopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BookingPopup({ open, onOpenChange }: BookingPopupProps) {
  const [step, setStep] = useState<BookingStep>('contact')
  const [stepOneData, setStepOneData] = useState<BookingStepOneData | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmedLead, setConfirmedLead] = useState<{
    name: string
    bookingDate: string
    bookingTime: string
  } | null>(null)

  function handleStepOneNext(data: BookingStepOneData) {
    setStepOneData(data)
    setStep('time')
  }

  function handleBack() {
    setStep('contact')
  }

  async function handleSubmit(data: BookingFormData) {
    setIsSubmitting(true)
    try {
      const result = await createBooking(data)
      if (result.success && result.lead) {
        setConfirmedLead({
          name: result.lead.name,
          bookingDate: result.lead.bookingDate,
          bookingTime: result.lead.bookingTime,
        })
        setStep('confirmation')
      } else if (result.error === 'slot_taken') {
        toast.error('That time slot was just taken. Please choose another.')
      } else if (result.error) {
        toast.error('Something went wrong. Please try again.')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleClose(open: boolean) {
    onOpenChange(open)
    // Reset state when dialog closes
    if (!open) {
      setTimeout(() => {
        setStep('contact')
        setStepOneData(null)
        setConfirmedLead(null)
        setIsSubmitting(false)
      }, 300) // allow close animation to finish
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-0 gap-0"
        showCloseButton={step !== 'confirmation'}
      >
        <DialogTitle className="sr-only">Book a Demo</DialogTitle>

        {step === 'contact' && (
          <StepOne onNext={handleStepOneNext} />
        )}

        {step === 'time' && stepOneData && (
          <StepTwo
            stepOneData={stepOneData}
            onBack={handleBack}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}

        {step === 'confirmation' && confirmedLead && (
          <Confirmation
            lead={confirmedLead}
            onClose={() => handleClose(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
