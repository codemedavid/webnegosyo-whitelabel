'use client'

import { cn } from '@/lib/utils'
import type { BoostItem } from '@/lib/boost/workspace'

const SIZE_CLASSES = {
  xs: 'h-7 w-7 rounded-md text-[10px]',
  sm: 'h-10 w-10 rounded-lg text-xs',
  md: 'h-12 w-12 rounded-xl text-sm',
  lg: 'h-16 w-16 rounded-2xl text-base',
} as const

export type DishSize = keyof typeof SIZE_CLASSES

interface DishPhotoProps {
  item: Pick<BoostItem, 'name' | 'imageUrl'> | null | undefined
  size?: DishSize
  className?: string
}

/**
 * The merchant's own food photo — the one piece of real imagery every offer
 * has. Dishes without a photo get their initial on a warm tile rather than a
 * generic placeholder icon, so a row of them still reads as a menu.
 */
export function DishPhoto({ item, size = 'sm', className }: DishPhotoProps) {
  const base = cn('relative shrink-0 overflow-hidden bg-muted', SIZE_CLASSES[size], className)
  if (item?.imageUrl) {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(base, 'flex items-center justify-center bg-amber-50 font-semibold text-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200/70')}
    >
      {item?.name?.trim().charAt(0).toUpperCase() || '·'}
    </span>
  )
}

interface DishStackProps {
  items: readonly (BoostItem | undefined)[]
  size?: DishSize
  max?: number
  className?: string
}

/** Overlapping photos for an offer made of several dishes. */
export function DishStack({ items, size = 'sm', max = 3, className }: DishStackProps) {
  const shown = items.filter((item): item is BoostItem => !!item).slice(0, max)
  const extra = items.filter(Boolean).length - shown.length
  return (
    <span className={cn('flex shrink-0 items-center', className)}>
      {shown.map((item, index) => (
        <DishPhoto
          key={`${item.id}-${index}`}
          item={item}
          size={size}
          className={cn('ring-2 ring-background', index > 0 && '-ml-3')}
        />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            SIZE_CLASSES[size],
            '-ml-3 flex items-center justify-center bg-muted font-semibold text-muted-foreground ring-2 ring-background'
          )}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}
