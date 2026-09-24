'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RECOVERY_DAYS } from '@/lib/order-deletion/constants'
import { cn } from '@/lib/utils'
import { ChooseStep } from './choose-step'
import { DeletionHistory } from './deletion-history'
import { ConfirmStep, DoneStep, ExportStep } from './export-and-confirm-steps'
import { useOrderDeletion, type WizardStep } from './use-order-deletion'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'choose', label: '1. Choose' },
  { key: 'export', label: '2. Export' },
  { key: 'confirm', label: '3. Confirm' },
]

function StepIndicator({ current }: { current: WizardStep }) {
  const currentIndex = current === 'done' ? STEPS.length : STEPS.findIndex((step) => step.key === current)
  return (
    <ol className="flex gap-4 text-sm">
      {STEPS.map((step, index) => (
        <li
          key={step.key}
          aria-current={index === currentIndex ? 'step' : undefined}
          className={cn(index === currentIndex ? 'font-semibold' : 'text-muted-foreground', index < currentIndex && 'line-through')}
        >
          {step.label}
        </li>
      ))}
    </ol>
  )
}

export function OrderDeletionWizard({ tenantId, storeName }: { tenantId: string; storeName: string }) {
  const state = useOrderDeletion(tenantId)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Delete orders</CardTitle>
          <CardDescription>
            Deleted orders disappear from your orders list and dashboard. You can restore them for{' '}
            {RECOVERY_DAYS} days; after that they are erased for good. Customers, loyalty stamps, stock
            counts and voucher usage are not changed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <StepIndicator current={state.step} />
          {state.error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.step === 'choose' && <ChooseStep state={state} />}
          {state.step === 'export' && <ExportStep state={state} />}
          {state.step === 'confirm' && <ConfirmStep state={state} storeName={storeName} />}
          {state.step === 'done' && <DoneStep state={state} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deletion history</CardTitle>
          <CardDescription>Every deletion on this store, and what can still be restored.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeletionHistory tenantId={tenantId} refreshKey={state.result} />
        </CardContent>
      </Card>
    </div>
  )
}
