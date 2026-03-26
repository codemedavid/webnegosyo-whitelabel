'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

interface ConfirmationProps {
  lead: {
    name: string
    bookingDate: string
    bookingTime: string
  }
  onClose: () => void
}

function formatDate(dateStr: string): string {
  // dateStr is 'YYYY-MM-DD'
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(timeStr: string): string {
  // timeStr is 'HH:mm'
  const [hourStr, minuteStr] = timeStr.split(':')
  const hour = parseInt(hourStr, 10)
  const minute = parseInt(minuteStr, 10)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`
}

export function Confirmation({ lead, onClose }: ConfirmationProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="bg-zinc-900 p-8 rounded-2xl flex flex-col items-center text-center gap-4">
      {/* Animated checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center"
      >
        <svg
          className="w-8 h-8 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>

      <div>
        <h2 className="text-zinc-100 text-xl font-semibold mb-1">You&apos;re booked!</h2>
        <p className="text-zinc-300 text-sm">
          We&apos;ll see you on <span className="text-amber-400 font-medium">{formatDate(lead.bookingDate)}</span>{' '}
          at <span className="text-amber-400 font-medium">{formatTime(lead.bookingTime)}</span>!
        </p>
      </div>

      <p className="text-zinc-500 text-sm">Check your email for confirmation details.</p>

      <Button
        type="button"
        variant="ghost"
        onClick={onClose}
        className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 text-sm mt-2"
      >
        Close
      </Button>
    </div>
  )
}
