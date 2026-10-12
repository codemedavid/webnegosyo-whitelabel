'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setApprovalPinAction } from '@/app/actions/tax-settings'
import { describeActionError } from '@/components/admin/server-action-safety'
import { approvalPinFormSchema, type ApprovalPinFormValues } from '@/lib/tax-settings/pin-schema'
import { Field, TaxCard, describedById } from './form-bits'

interface ApprovalPinCardProps {
  tenantId: string
  /** Null when it could not be checked; the card then states no verdict. */
  hasPin: boolean | null
}

const PIN_INPUT_PROPS = {
  type: 'password',
  inputMode: 'numeric',
  autoComplete: 'new-password',
  maxLength: 6,
  className: 'max-w-[12rem] font-mono tracking-[0.3em]',
} as const

function pinStatus(hasPin: boolean | null): string {
  if (hasPin === true) return 'You have a PIN. Enter a new one below to change it.'
  if (hasPin === false) return 'You haven’t set one yet.'
  return ''
}

/** The signed-in manager's own PIN — typed on the cashier's register to approve a discount. */
export function ApprovalPinCard({ tenantId, hasPin: initialHasPin }: ApprovalPinCardProps) {
  const [hasPin, setHasPin] = useState(initialHasPin)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ApprovalPinFormValues>({
    resolver: zodResolver(approvalPinFormSchema),
    defaultValues: { pin: '', confirmPin: '' },
  })

  const save = async (values: ApprovalPinFormValues) => {
    try {
      const result = await setApprovalPinAction(tenantId, values)
      if (!result.success) {
        // "Pick a PIN that is harder to guess", "Too many tries"… shown as the server words it.
        setError('pin', { type: 'server', message: result.error })
        return
      }
      reset()
      setHasPin(true)
      toast.success(hasPin ? 'Your PIN was changed' : 'Your PIN is set')
    } catch (error) {
      toast.error(describeActionError(error))
    }
  }

  const pinError = errors.pin?.message
  const confirmError = errors.confirmPin?.message
  const status = pinStatus(hasPin)

  return (
    <TaxCard
      id="tax-approval-pin"
      icon={KeyRound}
      title="Your approval PIN"
      description="When a discount needs a manager, you type this PIN on the cashier’s register. Keep it to yourself."
    >
      {status && <p className="text-sm font-medium">{status}</p>}
      <form onSubmit={handleSubmit(save)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="approval-pin" label={hasPin ? 'New PIN' : 'PIN'} hint="4 to 6 numbers. Avoid 1234 or your birthday." error={pinError}>
            <Input
              id="approval-pin"
              {...PIN_INPUT_PROPS}
              aria-invalid={Boolean(pinError)}
              aria-describedby={describedById('approval-pin', pinError)}
              {...register('pin')}
            />
          </Field>
          <Field id="approval-pin-confirm" label="Type it again" error={confirmError}>
            <Input
              id="approval-pin-confirm"
              {...PIN_INPUT_PROPS}
              aria-invalid={Boolean(confirmError)}
              aria-describedby={confirmError ? 'approval-pin-confirm-error' : undefined}
              {...register('confirmPin')}
            />
          </Field>
        </div>
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {hasPin ? 'Change PIN' : 'Set PIN'}
        </Button>
      </form>
    </TaxCard>
  )
}
