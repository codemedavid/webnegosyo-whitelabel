'use client'

/**
 * One dish in menu management, as a compact row: photo, name, the states an
 * owner scans for, price, and the availability switch. Tapping the row opens
 * the dish; the switch is the only other control. Delete lives on the dish.
 */

import { useId } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/cart-utils'
import { describeMenuAvailability, MENU_AVAILABILITY_LABEL } from '@/lib/inventory/menu-availability'
import type { MenuItem } from '@/types/database'
import type { BranchSummaryLabel } from '@/lib/outlets/outlet-menu-overrides'

interface MenuItemRowProps {
  item: MenuItem
  tenantSlug: string
  /** The switch position to show; differs from `item.is_available` while a change is saving. */
  isAvailable: boolean
  /** Null when the branch summary does not apply to this store. */
  branchLabel: BranchSummaryLabel | null
  isRecipeMissing: boolean
  isToggling: boolean
  onToggleAvailability: (next: boolean) => void
}

const WARNING_BADGE =
  'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300'

export function MenuItemRow({
  item,
  tenantSlug,
  isAvailable,
  branchLabel,
  isRecipeMissing,
  isToggling,
  onToggleAvailability,
}: MenuItemRowProps) {
  const switchId = useId()
  const availability = describeMenuAvailability(item)
  const isOff = !isAvailable

  return (
    <li className="flex items-center gap-1 pr-2 transition-colors hover:bg-muted/40 sm:pr-3">
      <Link
        href={`/${tenantSlug}/admin/menu/${item.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:pl-4"
      >
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
          <OptimizedImage
            src={item.image_url}
            alt=""
            fill
            className={cn('object-cover transition-[filter,opacity]', isOff && 'opacity-60 grayscale')}
            sizes="56px"
            loading="lazy"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold sm:text-base', isOff && 'text-muted-foreground')}>
            {item.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {/*
              The auto badge only when the system pulled the dish, never when
              the merchant switched it off — telling those apart at a glance is
              the point of `auto_disabled_at`.
            */}
            {availability === 'auto-hidden' ? (
              <Badge variant="destructive">{MENU_AVAILABILITY_LABEL['auto-hidden']}</Badge>
            ) : (
              isOff && <Badge variant="secondary">Out of stock</Badge>
            )}
            {item.presell_enabled && <Badge variant="outline">Pre-order</Badge>}
            {item.discounted_price ? <Badge variant="outline">Sale</Badge> : null}
            {item.is_featured && <Badge variant="outline">Featured</Badge>}
            {branchLabel && (
              <Badge
                variant="outline"
                className={branchLabel.tone === 'warning' ? WARNING_BADGE : undefined}
                title={branchLabel.detail}
              >
                {branchLabel.text}
              </Badge>
            )}
            {/*
              A dish with no recipe deducts nothing when it sells. The badge
              lives on the list the merchant actually visits.
            */}
            {isRecipeMissing && (
              <Badge
                variant="outline"
                className={WARNING_BADGE}
                title="Selling this deducts no stock. Open the dish and add its ingredients."
              >
                Not linked to inventory
              </Badge>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right leading-tight">
          {item.discounted_price ? (
            <div className="text-xs text-muted-foreground line-through tabular-nums">{formatPrice(item.price)}</div>
          ) : null}
          <div className="text-sm font-bold tabular-nums">{formatPrice(item.discounted_price || item.price)}</div>
        </div>
        <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
      </Link>

      {/* A 44px hit area around the switch: it is used mid-service, one-handed. */}
      <label htmlFor={switchId} className="flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center">
        <Switch
          id={switchId}
          checked={isAvailable}
          disabled={isToggling}
          onCheckedChange={onToggleAvailability}
          aria-label={`${item.name} available to order`}
        />
      </label>
    </li>
  )
}
