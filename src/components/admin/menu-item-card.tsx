'use client'

/**
 * One dish in menu management. The image carries the state badges; the body
 * carries name, category and price; the footer carries the switch and the
 * edit/delete actions. Every state a merchant scans for — out of stock,
 * pulled by the system, pre-order, not linked to inventory — is visible
 * without opening the item.
 */

import Link from 'next/link'
import { CalendarDays, Edit, Eye, EyeOff, Store, Trash2 } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/cart-utils'
import { describeMenuAvailability, MENU_AVAILABILITY_LABEL } from '@/lib/inventory/menu-availability'
import type { MenuItem } from '@/types/database'
import type { BranchSummaryLabel } from '@/lib/outlets/outlet-menu-overrides'

interface MenuItemCardProps {
  item: MenuItem
  categoryName?: string
  tenantSlug: string
  /** Null when the branch summary does not apply to this store. */
  branchLabel: BranchSummaryLabel | null
  isRecipeMissing: boolean
  isToggling: boolean
  onToggleAvailability: () => void
  onDelete: () => void
}

const ICON_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function MenuItemCard({
  item, categoryName, tenantSlug, branchLabel, isRecipeMissing, isToggling, onToggleAvailability, onDelete,
}: MenuItemCardProps) {
  const availability = describeMenuAvailability(item)
  const isOff = !item.is_available

  return (
    <article className={cn('group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md', isOff && 'bg-muted/30')}>
      <div className="relative aspect-[4/3] bg-muted">
        <OptimizedImage
          src={item.image_url}
          alt={item.name}
          fill
          className={cn('object-cover transition-opacity', isOff && 'opacity-60 grayscale-[35%]')}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          loading="lazy"
        />
        <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
          {item.presell_enabled && (
            <Badge><CalendarDays />Pre-order</Badge>
          )}
          {item.is_featured && <Badge variant="outline" className="bg-white/95 text-foreground shadow-xs dark:bg-neutral-900/90">Featured</Badge>}
          {item.discounted_price && <Badge variant="destructive">Sale</Badge>}
          {/*
            Only shown when the system pulled the dish, never when the
            merchant hid it — the whole point is telling those apart at a
            glance while scanning the grid for a missing bestseller.
          */}
          {availability === 'auto-hidden' && (
            <Badge variant="destructive">{MENU_AVAILABILITY_LABEL['auto-hidden']}</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-sm font-semibold leading-snug">{item.name}</h3>
            <div className="shrink-0 text-right leading-tight">
              {item.discounted_price && (
                <div className="text-[11px] text-muted-foreground line-through tabular-nums">{formatPrice(item.price)}</div>
              )}
              <div className="text-sm font-bold tabular-nums">{formatPrice(item.discounted_price || item.price)}</div>
            </div>
          </div>
          {categoryName && <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{categoryName}</p>}
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        </div>

        {(branchLabel || isRecipeMissing) && (
          <div className="flex flex-wrap gap-1">
            {branchLabel && (
              <Badge variant={branchLabel.tone === 'warning' ? 'destructive' : 'secondary'} title={branchLabel.detail}>
                <Store />{branchLabel.text}
              </Badge>
            )}
            {/*
              A dish with no recipe deducts nothing when it sells. The badge
              lives here, on the list the merchant actually visits, because
              the coverage view buried inside Inventory is the reason live
              stores have inventory on and zero recipes.
            */}
            {isRecipeMissing && (
              <Badge
                variant="outline"
                className="border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                title="Selling this deducts no stock. Open the item and add its recipe to link it."
              >
                Not linked to inventory
              </Badge>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t pt-2.5">
          {/*
            Not "Hidden" any more: the dish stays on the customer's menu
            marked unavailable. A merchant reading "Hidden" would think a
            discontinued dish was off their storefront.
          */}
          <button
            type="button"
            onClick={onToggleAvailability}
            disabled={isToggling}
            aria-pressed={item.is_available}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-50',
              item.is_available
                ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 hover:bg-emerald-600/20 dark:text-emerald-300'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {item.is_available ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {item.is_available ? 'Available' : 'Out of stock'}
          </button>
          <div className="flex items-center gap-0.5">
            <Link href={`/${tenantSlug}/admin/menu/${item.id}`} aria-label={`Edit ${item.name}`} className={ICON_BUTTON}>
              <Edit className="h-4 w-4" />
            </Link>
            <button type="button" aria-label={`Delete ${item.name}`} onClick={onDelete} className={cn(ICON_BUTTON, 'hover:bg-destructive/10 hover:text-destructive')}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
