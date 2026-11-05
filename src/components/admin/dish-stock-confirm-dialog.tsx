'use client'

import Link from 'next/link'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { DishStockBlocker } from '@/lib/inventory/dish-availability'

export interface DishStockQuestion {
  dishName: string
  blockers: DishStockBlocker[]
  /** ISO instant the "sell anyway" override ends (end of the business day). */
  sellAnywayUntil: string
}

interface DishStockConfirmDialogProps {
  question: DishStockQuestion | null
  tenantSlug: string
  isSaving: boolean
  onSellAnyway: () => void
  onCancel: () => void
}

const TIME_FORMAT = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })

/** "0 pc", "-1 pc", "0.05 kg": what the shelf reads, oversold included. */
export function formatOnHand(onHand: number, unit: string): string {
  return `${Math.round(onHand * 100) / 100} ${unit}`
}

/** "Egg", "Egg and Rice", "Egg, Rice and Cups". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The daily report's "record a count" deep link, reused. */
function countHref(tenantSlug: string, ingredientId: string): string {
  return `/${tenantSlug}/admin/inventory?tab=ingredients&stock=${ingredientId}&reason=stocktake`
}

/**
 * "Egg shows 0 pc. Record a count · Sell anyway until 12:00 AM · Cancel" —
 * asked when a person turns on a dish its counted stock can't make. Without it
 * a dish auto-86 had hidden went back on sale with no word about why it was
 * off, and was sold below zero (Square / Uber Eats "sold out for today").
 */
export function DishStockConfirmDialog({ question, tenantSlug, isSaving, onSellAnyway, onCancel }: DishStockConfirmDialogProps) {
  const blockers = question?.blockers ?? []
  const names = joinNames(blockers.map((blocker) => blocker.name))
  const verb = blockers.length > 1 ? 'show' : 'shows'
  const until = question ? TIME_FORMAT.format(new Date(question.sellAnywayUntil)) : ''
  const title = question ? `${question.dishName} can’t be made right now` : ''
  const firstBlocker = blockers[0]

  return (
    <AlertDialog open={question !== null} onOpenChange={(open) => { if (!open && !isSaving) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {names} {verb} empty on your stock count. If you turn the dish on, it stays on sale until {until} and
                your stock goes below zero.
              </p>
              <ul className="list-disc pl-5">
                {blockers.map((blocker) => (
                  <li key={blocker.ingredientId}>
                    {blocker.name}: {formatOnHand(blocker.onHand, blocker.unit)}
                  </li>
                ))}
              </ul>
              <p>Have it in the kitchen? Record a count first, then turn the dish on.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
          {firstBlocker ? (
            <Button variant="outline" asChild>
              <Link href={countHref(tenantSlug, firstBlocker.ingredientId)}>Record a count</Link>
            </Button>
          ) : null}
          <Button onClick={onSellAnyway} disabled={isSaving}>
            {isSaving ? 'Saving…' : `Sell anyway until ${until}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
