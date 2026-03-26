'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { bookingStepOneSchema, type BookingStepOneData } from '@/lib/booking/validation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface StepOneProps {
  onNext: (data: BookingStepOneData) => void
}

export function StepOne({ onNext }: StepOneProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BookingStepOneData>({
    resolver: zodResolver(bookingStepOneSchema),
  })

  return (
    <div className="bg-zinc-900 p-6 rounded-2xl">
      {/* Step indicator */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-zinc-400 text-sm">Step 1 of 2</p>
        <div className="flex gap-1.5 items-center">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          <span className="w-2 h-2 rounded-full bg-zinc-700 inline-block" />
        </div>
      </div>

      <h2 className="text-zinc-100 text-xl font-semibold mb-1">Book a Demo</h2>
      <p className="text-zinc-400 text-sm mb-6">Tell us a bit about yourself</p>

      <form onSubmit={handleSubmit(onNext)} noValidate className="flex flex-col gap-4">
        {/* Full Name */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="text-zinc-100">
            Full Name
          </Label>
          <Input
            id="name"
            type="text"
            placeholder="Juan dela Cruz"
            className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-amber-500 focus-visible:ring-amber-500/20"
            aria-invalid={errors.name ? 'true' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p className="text-red-400 text-xs">{errors.name.message}</p>
          )}
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-zinc-100">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="juan@example.com"
            className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-amber-500 focus-visible:ring-amber-500/20"
            aria-invalid={errors.email ? 'true' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-red-400 text-xs">{errors.email.message}</p>
          )}
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone" className="text-zinc-100">
            Phone
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+63 917 123 4567"
            className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-amber-500 focus-visible:ring-amber-500/20"
            aria-invalid={errors.phone ? 'true' : undefined}
            {...register('phone')}
          />
          {errors.phone && (
            <p className="text-red-400 text-xs">{errors.phone.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="mt-2 w-full bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 focus-visible:ring-amber-500/30"
        >
          Next: Choose Your Time →
        </Button>
      </form>
    </div>
  )
}
