'use client'

import { Banner } from '@astryxdesign/core/Banner'
import { List, ListItem } from '@astryxdesign/core/List'
import { StatusDot } from '@astryxdesign/core/StatusDot'
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
 * Presentation only — ordering and wording come from `stock-alerts-view.ts`, so
 * the merchant app shows the same list without re-deriving either. Renders
 * nothing when there is nothing wrong: a quiet day should cost no screen space.
 *
 * `status` follows the worst level present. An outage is an error because the
 * merchant cannot serve the dish at all; merely running low is a warning.
 */
export function StockAlertsBanner({ alerts }: StockAlertsBannerProps) {
  const summary = summarizeStockAlerts(alerts)
  if (summary.total === 0) return null

  const sorted = sortStockAlerts(alerts)

  return (
    <Banner
      status={summary.outCount > 0 ? 'error' : 'warning'}
      title={summary.headline}
      description="Reorder these before they hold up service."
      container="card"
      defaultIsExpanded
    >
      <List density="compact">
        {sorted.map((alert) => (
          <ListItem
            key={alert.id}
            label={describeStockAlert(alert)}
            startContent={
              <StatusDot
                variant={alert.level === 'out' ? 'error' : 'warning'}
                label={alert.level === 'out' ? 'Out of stock' : 'Running low'}
              />
            }
          />
        ))}
      </List>
    </Banner>
  )
}
