'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { setPosStockPolicyAction } from '@/app/actions/pos-stock-policy'
import { cn } from '@/lib/utils'
import type { PosStockPolicy } from '@/lib/inventory/pos-stock-policy'

interface PosStockPolicyCardProps {
  tenantId: string
  tenantSlug: string
  policy: PosStockPolicy
  /** Owner on a store-wide account (or superadmin) — `canChangePosStockPolicy`. */
  canChange: boolean
}

interface PolicyChoice {
  value: PosStockPolicy
  label: string
  detail: string
}

const CHOICES: readonly PolicyChoice[] = [
  {
    value: 'warn',
    label: 'Warn the cashier (default)',
    detail: 'The register says how many are left. The cashier can still sell more.',
  },
  {
    value: 'block',
    label: 'Only a manager can sell past the count',
    detail:
      'A manager or owner signs in on the register to sell more than the stock covers. Sales made while the register is offline are never blocked.',
  },
]

/**
 * Inventory → "When stock runs short at the register" (`tenants.pos_stock_policy`).
 * The online menu never sells what it cannot make, whatever is chosen here.
 */
export function PosStockPolicyCard({ tenantId, tenantSlug, policy, canChange }: PosStockPolicyCardProps) {
  const [selected, setSelected] = useState<PosStockPolicy>(policy)
  const [isSaving, startSaving] = useTransition()

  function choose(next: PosStockPolicy) {
    if (!canChange || isSaving || next === selected) return
    const previous = selected
    setSelected(next)
    startSaving(async () => {
      const result = await setPosStockPolicyAction(tenantId, tenantSlug, next)
      if (result.success) {
        toast.success('Saved')
        return
      }
      setSelected(previous)
      toast.error(result.error)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">When stock runs short at the register</CardTitle>
        <CardDescription>
          For sales on the merchant app. Online orders are always stopped when you run out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div role="radiogroup" aria-label="When stock runs short at the register" className="grid gap-3 sm:grid-cols-2">
          {CHOICES.map((choice) => {
            const isSelected = choice.value === selected
            return (
              <button
                key={choice.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!canChange || isSaving}
                onClick={() => choose(choice.value)}
                className={cn(
                  'min-h-11 rounded-lg border p-4 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed',
                  isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                  !canChange && !isSelected && 'opacity-60',
                )}
              >
                <span className="block font-medium">{choice.label}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{choice.detail}</span>
              </button>
            )
          })}
        </div>
        {!canChange && <p className="text-sm text-muted-foreground">Only the store owner can change this.</p>}
      </CardContent>
    </Card>
  )
}
