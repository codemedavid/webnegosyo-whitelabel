'use client'

import { useState, useMemo, useCallback, useTransition } from 'react'
import { X, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WizardStepSource } from '@/components/admin/wizard-step-source'
import { WizardStepTarget } from '@/components/admin/wizard-step-target'
import { WizardStepCustomize } from '@/components/admin/wizard-step-customize'
import {
  createUpsellPairAction,
  deleteUpsellPairAction,
} from '@/app/actions/menu-engineering'
import { formatPrice } from '@/lib/cart-utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { MenuItemWithCategory, UpsellPairWithItems } from '@/types/database'

export interface UpgradePairWizardProps {
  menuItems: MenuItemWithCategory[]
  tenantId: string
  tenantSlug: string
  existingPair?: UpsellPairWithItems | null
  onClose: () => void
}

const STEPS = [
  { label: 'Basic Item', shortLabel: '1' },
  { label: 'Upgrade Item', shortLabel: '2' },
  { label: 'Customize', shortLabel: '3' },
] as const

export function UpgradePairWizard({
  menuItems,
  tenantId,
  tenantSlug,
  existingPair,
  onClose,
}: UpgradePairWizardProps) {
  const isEditing = !!existingPair
  const [currentStep, setCurrentStep] = useState(() => {
    // When editing, skip straight to customize if both items are pre-selected
    if (existingPair?.source_item_id && existingPair?.target_item_id) return 2
    return 0
  })
  const [sourceItemId, setSourceItemId] = useState<string | null>(
    existingPair?.source_item_id ?? null
  )
  const [targetItemId, setTargetItemId] = useState<string | null>(
    existingPair?.target_item_id ?? null
  )
  const [upgradeHeader, setUpgradeHeader] = useState(
    existingPair?.upgrade_header ?? ''
  )
  const [sourceLabel, setSourceLabel] = useState(
    existingPair?.source_label ?? ''
  )
  const [targetLabel, setTargetLabel] = useState(
    existingPair?.target_label ?? ''
  )
  const [isPending, startTransition] = useTransition()

  const availableItems = useMemo(
    () => menuItems.filter((item) => item.is_available),
    [menuItems]
  )

  const sourceItem = useMemo(
    () => availableItems.find((item) => item.id === sourceItemId) ?? null,
    [availableItems, sourceItemId]
  )
  const targetItem = useMemo(
    () => availableItems.find((item) => item.id === targetItemId) ?? null,
    [availableItems, targetItemId]
  )

  const canGoNext =
    (currentStep === 0 && sourceItemId !== null) ||
    (currentStep === 1 && targetItemId !== null) ||
    currentStep === 2

  const handleNext = useCallback(() => {
    if (currentStep < 2) setCurrentStep((s) => s + 1)
  }, [currentStep])

  const handleBack = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1)
  }, [currentStep])

  const handleSourceSelect = useCallback((itemId: string) => {
    setSourceItemId(itemId)
    // Clear target if source changes to avoid invalid pair
    setTargetItemId((prev) => (prev === itemId ? null : prev))
  }, [])

  const handleTargetSelect = useCallback(
    (itemId: string) => setTargetItemId(itemId),
    []
  )

  const handleSubmit = useCallback(() => {
    if (!sourceItemId || !targetItemId) return

    startTransition(async () => {
      // For edit: delete old pair then create new one
      if (isEditing && existingPair) {
        const deleteResult = await deleteUpsellPairAction(
          existingPair.id,
          tenantId,
          tenantSlug
        )
        if (!deleteResult.success) {
          toast.error(deleteResult.error || 'Failed to update pair')
          return
        }
      }

      const result = await createUpsellPairAction(tenantId, tenantSlug, {
        source_item_id: sourceItemId,
        target_item_id: targetItemId,
        pair_type: 'upgrade',
        upgrade_header: upgradeHeader || undefined,
        source_label: sourceLabel || undefined,
        target_label: targetLabel || undefined,
      })

      if (result.success) {
        toast.success(isEditing ? 'Upgrade pair updated' : 'Upgrade pair created')
        onClose()
      } else {
        // If this was an edit and create failed, the old pair is already deleted.
        // Warn the user so they can recreate it.
        if (isEditing) {
          toast.error(
            'Failed to save updated pair. The old pair was removed — please recreate it.'
          )
        } else {
          toast.error(result.error || 'Failed to create pair')
        }
      }
    })
  }, [
    sourceItemId,
    targetItemId,
    isEditing,
    existingPair,
    tenantId,
    tenantSlug,
    upgradeHeader,
    sourceLabel,
    targetLabel,
    onClose,
  ])

  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      {/* Progress Bar */}
      <div className="flex items-center gap-0 border-b bg-gradient-to-r from-primary/5 to-primary/[0.02] px-4 py-3 sm:px-5">
        {STEPS.map((step, i) => {
          const isCompleted = i < currentStep
          const isActive = i === currentStep
          return (
            <div key={step.label} className="flex flex-1 items-center gap-0">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    isCompleted && 'bg-green-500 text-white',
                    isActive && 'bg-primary text-primary-foreground',
                    !isCompleted && !isActive && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={cn(
                    'hidden text-xs font-medium sm:inline',
                    isCompleted && 'text-green-600',
                    isActive && 'text-primary',
                    !isCompleted && !isActive && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-3 h-0.5 flex-1 rounded-full',
                    i < currentStep ? 'bg-green-500' : i === currentStep ? 'bg-primary' : 'bg-muted',
                  )}
                />
              )}
            </div>
          )
        })}

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="ml-2 h-7 w-7 shrink-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Step Content */}
      <div className="max-h-[60vh] overflow-y-auto">
        {currentStep === 0 && (
          <WizardStepSource
            items={availableItems}
            selectedItemId={sourceItemId}
            onSelect={handleSourceSelect}
          />
        )}
        {currentStep === 1 && sourceItem && (
          <WizardStepTarget
            items={availableItems}
            sourceItem={sourceItem}
            selectedItemId={targetItemId}
            onSelect={handleTargetSelect}
          />
        )}
        {currentStep === 2 && sourceItem && targetItem && (
          <WizardStepCustomize
            sourceItem={sourceItem}
            targetItem={targetItem}
            upgradeHeader={upgradeHeader}
            sourceLabel={sourceLabel}
            targetLabel={targetLabel}
            onUpgradeHeaderChange={setUpgradeHeader}
            onSourceLabelChange={setSourceLabel}
            onTargetLabelChange={setTargetLabel}
          />
        )}
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3 sm:px-5">
        <Button
          variant="outline"
          size="sm"
          onClick={currentStep === 0 ? onClose : handleBack}
          disabled={isPending}
        >
          {currentStep === 0 ? (
            'Cancel'
          ) : (
            <>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </>
          )}
        </Button>

        <div className="hidden sm:block">
          {currentStep === 0 && sourceItem && (
            <span className="text-xs text-muted-foreground">
              Selected:{' '}
              <strong className="text-primary">{sourceItem.name} ({formatPrice(sourceItem.price)})</strong>
            </span>
          )}
          {currentStep === 1 && targetItem && sourceItem && (
            <span className="text-xs text-muted-foreground">
              Upgrade:{' '}
              <strong className="text-primary">{targetItem.name} ({formatPrice(targetItem.price)})</strong>
              {targetItem.price - sourceItem.price > 0 && (
                <span className="ml-1 font-semibold text-green-600">
                  +{formatPrice(targetItem.price - sourceItem.price)}/order
                </span>
              )}
            </span>
          )}
        </div>

        {currentStep < 2 ? (
          <Button size="sm" onClick={handleNext} disabled={!canGoNext}>
            Next
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isEditing ? 'Save Changes' : 'Create Upgrade Pair'}
          </Button>
        )}
      </div>
    </div>
  )
}
