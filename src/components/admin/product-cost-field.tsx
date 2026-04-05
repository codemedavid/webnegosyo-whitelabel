'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface ProductCostFieldProps {
  menuItemId?: string
  currentPrice: number
  discountedPrice?: number
  convexSave?: (args: { menuItemId: string; costPrice: number; costNotes?: string }) => Promise<void>
  initialCostPrice?: number
  initialCostNotes?: string
}

export function ProductCostField({
  menuItemId,
  currentPrice,
  discountedPrice,
  convexSave,
  initialCostPrice,
  initialCostNotes,
}: ProductCostFieldProps) {
  const [costPrice, setCostPrice] = useState(initialCostPrice?.toString() ?? '')
  const [costNotes, setCostNotes] = useState(initialCostNotes ?? '')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (initialCostPrice !== undefined) setCostPrice(initialCostPrice.toString())
    if (initialCostNotes !== undefined) setCostNotes(initialCostNotes)
  }, [initialCostPrice, initialCostNotes])

  const effectivePrice = discountedPrice && discountedPrice > 0 ? discountedPrice : currentPrice
  const cost = parseFloat(costPrice)
  const hasCost = !isNaN(cost) && cost > 0
  const profit = hasCost ? effectivePrice - cost : 0
  const marginPercent = hasCost && effectivePrice > 0
    ? Math.round((profit / effectivePrice) * 1000) / 10
    : 0

  const handleSave = useCallback(async () => {
    if (!hasCost || !menuItemId || !convexSave) return
    setIsSaving(true)
    try {
      await convexSave({
        menuItemId,
        costPrice: cost,
        costNotes: costNotes || undefined,
      })
      toast.success('Cost price saved')
    } catch {
      // Convex function may not be deployed yet — silently skip
    } finally {
      setIsSaving(false)
    }
  }, [hasCost, cost, costNotes, menuItemId, convexSave])

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Cost & Margin Analysis</Label>
        {hasCost && (
          <Badge
            variant={marginPercent >= 40 ? 'default' : marginPercent >= 20 ? 'secondary' : 'destructive'}
          >
            {marginPercent}% margin
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cost_price">Cost Price (₱)</Label>
          <Input
            id="cost_price"
            type="number"
            step="0.01"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            onBlur={handleSave}
            placeholder="What it costs to make"
            disabled={isSaving}
          />
        </div>

        {hasCost && (
          <div className="space-y-2">
            <Label>Projected Profit</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm">
              <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                {profit >= 0 ? '+' : ''}{'\u20B1'}{Math.round(profit)} per unit ({marginPercent}%)
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cost_notes">Cost Notes</Label>
        <Textarea
          id="cost_notes"
          value={costNotes}
          onChange={(e) => setCostNotes(e.target.value)}
          onBlur={handleSave}
          placeholder="Optional notes (e.g., 'supplier raised price')"
          rows={2}
          className="text-sm"
          disabled={isSaving}
        />
      </div>
    </div>
  )
}
