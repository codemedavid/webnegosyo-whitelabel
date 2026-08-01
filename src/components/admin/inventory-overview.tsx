'use client'

import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, EyeOff, PackageX, TrendingDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ActivityFeedEntry } from '@/lib/inventory/activity-feed'
import type { AutoHiddenDish } from '@/lib/inventory/auto-86-blame'
import type { InventoryHealth } from '@/lib/inventory/inventory-health'

/**
 * Locale formatting runs on the client only.
 *
 * Rendering a locale-formatted date during SSR produces different text on the
 * server and the client and trips hydration — a bug this codebase has already
 * shipped twice.
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * A real `<time>`, and never a blank cell.
 *
 * The mount gate is the right fix for the hydration mismatch, but rendering an
 * empty string until it flips meant a screen reader on a slow client heard
 * nothing where the event time should be. The server emits the machine date —
 * deterministic, so it hydrates cleanly — and the browser swaps in the
 * merchant's own locale once it can.
 */
function Timestamp({ iso }: { iso: string }) {
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => setIsMounted(true), [])

  return (
    <time
      dateTime={iso}
      suppressHydrationWarning
      className="shrink-0 text-xs text-muted-foreground"
    >
      {isMounted ? formatTimestamp(iso) : iso.slice(0, 10)}
    </time>
  )
}

const DIRECTION_CLASS = {
  in: 'text-emerald-600',
  out: 'text-red-600',
  mixed: 'text-muted-foreground',
} as const

interface FigureProps {
  value: number
  label: string
  tone?: 'neutral' | 'warn' | 'bad'
}

/**
 * One figure on the summary line.
 *
 * These used to be four 3xl tiles filling a screen of their own. They are
 * context for the list below them, not the content of a page — the merchant
 * came to find an ingredient, and the count of ingredients is a caption.
 */
function Figure({ value, label, tone = 'neutral' }: FigureProps) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className={cn(
          'font-semibold tabular-nums',
          tone === 'warn' && value > 0 && 'text-amber-800 dark:text-amber-400',
          tone === 'bad' && value > 0 && 'text-red-600',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

interface HealthStripProps {
  health: InventoryHealth
}

/**
 * What inventory is doing, and where it cannot — in one line and one banner.
 *
 * Sits above the ingredient list rather than on a tab of its own. A merchant
 * opening inventory at 7pm is looking for an ingredient, not for a dashboard;
 * these figures are what they need to see on the way past.
 */
export function InventoryHealthStrip({ health }: HealthStripProps) {
  if (health.ingredients.total === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <PackageX className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">No ingredients yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Add the raw materials you buy — flour, cheese, cooking oil. Stock levels, recipe costs
          and the daily report all follow from them.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <Figure value={health.ingredients.total} label="ingredients" />
        <Figure value={health.ingredients.low} label="running low" tone="warn" />
        <Figure value={health.ingredients.out} label="out of stock" tone="bad" />
        <span className="text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {health.dishes.withRecipe}
          </span>{' '}
          of {health.dishes.total} dishes set up
        </span>
      </p>

      {health.gaps.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <h3 className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            Not everything is switched on
          </h3>
          <ul className="mt-3 space-y-3">
            {health.gaps.map((gap) => (
              <li key={gap.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{gap.title}</p>
                  {!gap.isSelfServe && (
                    <Badge variant="outline" className="text-xs">
                      Needs support
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">{gap.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

interface LogsProps {
  autoHidden: AutoHiddenDish[]
  activity: ActivityFeedEntry[]
  /** The ledger read failed — distinct from a quiet day with nothing in it. */
  activityLoadFailed?: boolean
}

/**
 * What changed, below the list it changed.
 *
 * Two logs of unequal priority: what is off the menu is actionable and leads;
 * recent activity is reference and follows.
 */
export function InventoryLogs({ autoHidden, activity, activityLoadFailed = false }: LogsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b p-4">
          <EyeOff className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Taken off the menu</h3>
          {autoHidden.length > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {autoHidden.length}
            </Badge>
          )}
        </div>

        {autoHidden.length === 0 ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Nothing is hidden for lack of stock — every dish with a recipe can be made.
          </p>
        ) : (
          <ul className="divide-y">
            {autoHidden.map((dish) => (
              <li key={dish.menuItemId} className="flex flex-wrap items-start gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{dish.name}</p>
                  {dish.blockingIngredients.length > 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Waiting on{' '}
                      <span className="font-medium text-foreground">
                        {dish.blockingIngredients.map((i) => i.name).join(', ')}
                      </span>
                      . Restock and it goes back on sale by itself.
                    </p>
                  ) : (
                    /*
                      Hidden with nothing left holding it down. The recovery path
                      should already have put this back, so surfacing it is the
                      only way a merchant finds a dish stuck off their menu.
                    */
                    <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                      Its ingredients are back in stock but the dish has not returned. Switch it on
                      yourself under Menu Management.
                    </p>
                  )}
                </div>
                <Timestamp iso={dish.hiddenAt} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b p-4">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Recent activity</h3>
        </div>

        {activityLoadFailed ? (
          <p className="p-4 text-sm text-muted-foreground">
            We could not load your recent stock activity. Reload the page, and if it keeps happening
            the ledger read is failing.
          </p>
        ) : activity.length === 0 ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <TrendingDown className="h-4 w-4" />
            Nothing has moved yet. Stock changes when you receive, count or waste it — and
            automatically when an order comes in for a dish with a recipe.
          </p>
        ) : (
          <ul className="divide-y">
            {activity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-start gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {entry.title}
                    {entry.isAutomatic && (
                      <Badge variant="outline" className="text-xs font-normal">
                        Automatic
                      </Badge>
                    )}
                  </p>
                  <p className={cn('mt-1 text-sm tabular-nums', DIRECTION_CLASS[entry.direction])}>
                    {entry.lines.join(' · ')}
                  </p>
                  {/*
                    Rendered only when known. Labelling the unattributed rows
                    "Unknown" would read as a system that lost the name rather
                    than one that never recorded it — and every row written
                    before attribution shipped is unattributed.
                  */}
                  {entry.actorName && (
                    <p className="mt-1 text-xs text-muted-foreground">by {entry.actorName}</p>
                  )}
                </div>
                <Timestamp iso={entry.createdAt} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
