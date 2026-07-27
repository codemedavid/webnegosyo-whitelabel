'use client'

import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { Divider } from '@astryxdesign/core/Divider'
import { StockHistoryList } from '@/components/admin/stock-history-list'
import { formatQuantity } from '@/components/admin/inventory/stock-level-cell'
import type { StockMovementDraft } from '@/lib/inventory/stock-form'
import {
  MANUAL_MOVEMENT_REASONS,
  MOVEMENT_REASON_LABELS,
  type StockMovementReason,
} from '@/lib/inventory/stock-ledger'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

/** Explains what the quantity field means for the chosen reason. */
function reasonHint(reason: StockMovementReason): string {
  if (reason === 'stocktake') return 'Enter the amount you actually counted.'
  if (reason === 'waste') return 'Enter how much was thrown away.'
  return 'Enter how much arrived.'
}

interface StockDialogProps {
  tenantId: string
  item: InventoryItem | null
  units: InventoryUnitRow[]
  unitLabel: (unitId: string) => string
  draft: StockMovementDraft
  setDraft: (update: (draft: StockMovementDraft) => StockMovementDraft) => void
  isRecording: boolean
  onClose: () => void
  onRecord: () => void
}

/**
 * Recording what happened to an ingredient's stock.
 *
 * The three reasons are a SegmentedControl rather than a row of buttons: they
 * are mutually exclusive and all worth seeing at once, which is exactly what
 * Astryx reserves that control for. The hint underneath changes with the
 * reason because "quantity" means three different things — arrived, counted,
 * thrown away — and getting that wrong writes a wrong ledger row.
 */
export function StockDialog({
  tenantId,
  item,
  units,
  unitLabel,
  draft,
  setDraft,
  isRecording,
  onClose,
  onRecord,
}: StockDialogProps) {
  return (
    <Dialog
      isOpen={item !== null}
      onOpenChange={(open) => !open && onClose()}
      width={560}
      purpose="form"
    >
      <DialogHeader
        title={item ? `Stock — ${item.name}` : 'Stock'}
        subtitle={
          item
            ? `${formatQuantity(item.current_qty)} ${unitLabel(item.stock_unit_id)} on hand`
            : undefined
        }
        onOpenChange={(open) => !open && onClose()}
      />

      {item && (
        <VStack gap={3} padding={4}>
          <VStack gap={1}>
            <SegmentedControl
              label="What happened"
              value={draft.reason}
              onChange={(value) =>
                setDraft((d) => ({ ...d, reason: value as StockMovementReason }))
              }
              layout="fill"
            >
              {MANUAL_MOVEMENT_REASONS.map((reason) => (
                <SegmentedControlItem
                  key={reason}
                  value={reason}
                  label={MOVEMENT_REASON_LABELS[reason]}
                />
              ))}
            </SegmentedControl>
            <Text type="supporting" color="secondary">
              {reasonHint(draft.reason)}
            </Text>
          </VStack>

          <HStack gap={3}>
            <NumberInput
              label="Quantity"
              value={draft.quantity === '' ? null : Number(draft.quantity)}
              onChange={(value) => setDraft((d) => ({ ...d, quantity: String(value) }))}
              min={0}
              placeholder="0"
            />
            <Selector
              label="Unit"
              placeholder="Select a unit"
              value={draft.unit_id || undefined}
              onChange={(value) => setDraft((d) => ({ ...d, unit_id: value }))}
              options={units.map((unit) => ({ value: unit.id, label: unit.abbreviation }))}
            />
          </HStack>

          {draft.reason === 'receive' && (
            <NumberInput
              label="Unit cost (₱)"
              description="Leave blank to keep the current cost. A price here is blended with the stock already on hand."
              value={draft.unit_cost === '' ? null : Number(draft.unit_cost)}
              onChange={(value) => setDraft((d) => ({ ...d, unit_cost: String(value) }))}
              min={0}
              step={0.01}
              placeholder={item.unit_cost.toFixed(2)}
              isOptional
            />
          )}

          <TextInput
            label="Note"
            placeholder="e.g., delivery #1042"
            value={draft.note}
            onChange={(value) => setDraft((d) => ({ ...d, note: value }))}
            isOptional
          />

          <Divider />

          <VStack gap={2}>
            <Text type="label">Recent movements</Text>
            <StockHistoryList tenantId={tenantId} item={item} units={units} />
          </VStack>

          <HStack gap={2} justify="end">
            <Button label="Cancel" variant="ghost" onClick={onClose} isDisabled={isRecording} />
            <Button label="Record" variant="primary" onClick={onRecord} isLoading={isRecording} />
          </HStack>
        </VStack>
      )}
    </Dialog>
  )
}
