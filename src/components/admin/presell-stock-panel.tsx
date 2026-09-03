'use client'

/**
 * Per-date presell allocations for one menu item, inside the menu item form.
 *
 * Each row is a date the merchant promises: stock offered, sold so far,
 * remaining. Only `stock_qty` is editable — sold counts move exclusively
 * through orders (apply_presell_order), so this panel can never un-sell.
 * Deleting a date with sales is refused server-side; the merchant lowers
 * stock to the sold count instead.
 */

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getPresellStockAction,
  savePresellAllocationAction,
  deletePresellAllocationAction,
} from '@/app/actions/presell'
import { resolvePresellRemaining } from '@/lib/presell/availability'
import type { PresellStock } from '@/types/database'

interface PresellStockPanelProps {
  tenantId: string
  tenantSlug: string
  menuItemId: string
}

export function PresellStockPanel({ tenantId, tenantSlug, menuItemId }: PresellStockPanelProps) {
  const [rows, setRows] = useState<PresellStock[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newDate, setNewDate] = useState('')
  const [newQty, setNewQty] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const reload = useCallback(async () => {
    const result = await getPresellStockAction(tenantId, menuItemId)
    if (result.success && result.data) {
      setRows(result.data)
    } else if (result.error) {
      toast.error(result.error)
    }
    setIsLoading(false)
  }, [tenantId, menuItemId])

  useEffect(() => {
    void reload()
  }, [reload])

  const saveAllocation = async (presellDate: string, stockQty: number) => {
    setIsSaving(true)
    const result = await savePresellAllocationAction(tenantId, tenantSlug, {
      menuItemId,
      presellDate,
      stockQty,
    })
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error || 'Failed to save presell date')
      return false
    }
    await reload()
    return true
  }

  const handleAdd = async () => {
    const qty = Number(newQty)
    if (!newDate || !Number.isInteger(qty) || qty < 0) {
      toast.error('Pick a date and a whole-number stock amount')
      return
    }
    const saved = await saveAllocation(newDate, qty)
    if (saved) {
      setNewDate('')
      setNewQty('')
      toast.success('Presell date saved')
    }
  }

  const handleStockChange = async (row: PresellStock, value: string) => {
    const qty = Number(value)
    if (!Number.isInteger(qty) || qty < 0) return
    if (qty === row.stock_qty) return
    await saveAllocation(row.presell_date, qty)
  }

  const handleDelete = async (row: PresellStock) => {
    const result = await deletePresellAllocationAction(tenantId, tenantSlug, {
      menuItemId,
      presellDate: row.presell_date,
    })
    if (!result.success) {
      toast.error(result.error || 'Failed to remove presell date')
      return
    }
    toast.success('Presell date removed')
    await reload()
  }

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading presell dates…</p>
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No dates yet. Add a date and how many can be made for it.
        </p>
      )}
      {rows.map((row) => {
        const remaining = resolvePresellRemaining(row.stock_qty, row.sold_qty)
        return (
          <div key={row.presell_date} className="flex items-center gap-2">
            <span className="w-28 text-sm tabular-nums">{row.presell_date}</span>
            <Input
              type="number"
              min={0}
              step={1}
              defaultValue={row.stock_qty}
              onBlur={(e) => void handleStockChange(row, e.target.value)}
              className="w-24"
              aria-label={`Stock for ${row.presell_date}`}
            />
            <span className="text-xs text-muted-foreground">
              {row.sold_qty} sold · {remaining} left
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void handleDelete(row)}
              disabled={isSaving}
              aria-label={`Remove ${row.presell_date}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}
      <div className="flex items-center gap-2 pt-1">
        <Input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="w-40"
          aria-label="New presell date"
        />
        <Input
          type="number"
          min={0}
          step={1}
          value={newQty}
          onChange={(e) => setNewQty(e.target.value)}
          placeholder="Stock"
          className="w-24"
          aria-label="Stock for new date"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void handleAdd()} disabled={isSaving}>
          <Plus className="mr-1 h-4 w-4" /> Add date
        </Button>
      </div>
    </div>
  )
}
