import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  describeStockAlert,
  sortStockAlerts,
  summarizeStockAlerts,
  type StockAlertView,
} from '@/lib/inventory/stock-alerts-view'

interface StockAlertsBannerProps {
  alerts: readonly StockAlertView[]
}

/**
 * What a merchant sees when an ingredient has crossed its reorder level.
 *
 * Presentation only — the ordering and the wording come from
 * `stock-alerts-view.ts`, so the merchant app can show the same list without
 * re-deriving either. Renders nothing at all when there is nothing wrong: a
 * quiet day should not cost any screen space.
 *
 * `role="status"` rather than `role="alert"`: a merchant mid-service should
 * hear about an outage on the next natural pause, not be interrupted.
 */
export function StockAlertsBanner({ alerts }: StockAlertsBannerProps) {
  const summary = summarizeStockAlerts(alerts)
  if (summary.total === 0) return null

  const sorted = sortStockAlerts(alerts)

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          {summary.headline}
        </p>
      </div>

      {/*
        Capped on a phone. A shop twenty ingredients short used to open this page
        to a full screen of amber with the tabs pushed below the fold — the
        warning ate the navigation that answers it.
      */}
      <ul className="mt-3 space-y-1.5 max-md:max-h-44 max-md:overflow-y-auto">
        {sorted.map((alert) => (
          <li key={alert.id} className="flex items-center gap-2 text-sm">
            <Badge
              variant={alert.level === 'out' ? 'destructive' : 'secondary'}
              className="text-[10px] uppercase"
            >
              {alert.level === 'out' ? 'Out' : 'Low'}
            </Badge>
            <span className="text-amber-900/80 dark:text-amber-200/80">{describeStockAlert(alert)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
