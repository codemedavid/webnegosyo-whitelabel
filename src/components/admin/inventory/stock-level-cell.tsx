'use client'

import { HStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { evaluateStockLevel, type StockLevel } from '@/lib/inventory/low-stock'
import type { InventoryItem } from '@/types/database'

/** Trims the trailing zeros a NUMERIC(16,4) round-trip leaves behind. */
export function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(4)).toString()
}

/**
 * Astryx's rule is that status belongs to StatusDot and Badge is for counts and
 * enumerated states, so the level is a dot rather than the pill the shadcn
 * version used. A healthy ingredient gets no dot at all: a marker on every row
 * would drown the two rows that matter.
 */
const LEVEL_STATUS: Partial<Record<StockLevel, { variant: 'error' | 'warning'; label: string }>> = {
  out: { variant: 'error', label: 'Out of stock' },
  low: { variant: 'warning', label: 'Running low' },
}

interface StockLevelCellProps {
  item: InventoryItem
  unitAbbreviation: string
}

export function StockLevelCell({ item, unitAbbreviation }: StockLevelCellProps) {
  const status = LEVEL_STATUS[evaluateStockLevel(item)]

  return (
    <HStack gap={1.5} vAlign="center">
      {status && <StatusDot variant={status.variant} label={status.label} tooltip={status.label} />}
      <Text type="body">{`${formatQuantity(item.current_qty)} ${unitAbbreviation}`}</Text>
    </HStack>
  )
}
