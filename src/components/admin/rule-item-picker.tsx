'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MenuItem } from '@/types/database'

const BCG_BADGES: Record<string, { label: string; className: string }> = {
  star: { label: 'Star', className: 'bg-amber-900/50 text-amber-400' },
  plowhorse: { label: 'Plowhorse', className: 'bg-blue-900/50 text-blue-400' },
  puzzle: { label: 'Puzzle', className: 'bg-purple-900/50 text-purple-400' },
  dog: { label: 'Dog', className: 'bg-stone-800/50 text-stone-400' },
}

interface RuleItemPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryName: string
  items: MenuItem[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
}

export function RuleItemPicker({
  open,
  onOpenChange,
  categoryName,
  items,
  selectedIds,
  onSelectionChange,
}: RuleItemPickerProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const available = items.filter((i) => i.is_available)
    const unavailable = items.filter((i) => !i.is_available)

    const matchAvailable = q
      ? available.filter((i) => i.name.toLowerCase().includes(q))
      : available
    const matchUnavailable = q
      ? unavailable.filter((i) => i.name.toLowerCase().includes(q))
      : unavailable

    return { available: matchAvailable, unavailable: matchUnavailable }
  }, [items, search])

  const toggle = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pick items from {categoryName}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Select which items to suggest when this rule triggers
          </p>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{selectedIds.size} selected</span>
        </div>

        <Input
          placeholder={`Search ${categoryName.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {filtered.available.map((item) => {
            const isSelected = selectedIds.has(item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-2.5 rounded-md text-left transition-colors',
                  isSelected
                    ? 'bg-green-950/40 border border-green-800'
                    : 'bg-muted/30 border border-transparent hover:bg-muted/50'
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded border flex items-center justify-center shrink-0',
                    isSelected
                      ? 'bg-green-600 border-green-600'
                      : 'border-muted-foreground/40'
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ₱{item.discounted_price ?? item.price}
                  </div>
                </div>
                {item.bcg_classification && item.bcg_classification !== 'unclassified' && (
                  <Badge variant="outline" className={cn('text-[10px] shrink-0', BCG_BADGES[item.bcg_classification]?.className)}>
                    {BCG_BADGES[item.bcg_classification]?.label}
                  </Badge>
                )}
              </button>
            )
          })}

          {filtered.unavailable.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground pt-2 pb-1">Unavailable</div>
              {filtered.unavailable.map((item) => (
                <div
                  key={item.id}
                  className="w-full flex items-center gap-3 p-2.5 rounded-md opacity-40"
                >
                  <div className="w-5 h-5 rounded border border-muted-foreground/20 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.name}</div>
                    <div className="text-xs text-muted-foreground">₱{item.price} · Unavailable</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <Button onClick={() => onOpenChange(false)} className="w-full">
          Done ({selectedIds.size} selected)
        </Button>
      </DialogContent>
    </Dialog>
  )
}
