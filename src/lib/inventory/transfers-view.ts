/**
 * Presenting a transfer.
 *
 * `stock-transfer.ts` decides what a transfer may do; this decides what to
 * *offer*, and the two are deliberately driven from the same predicates rather
 * than from a parallel set of conditionals. A screen that offers a button the
 * service then refuses teaches the merchant its own rules by rejecting them,
 * which is how a manager ends up believing the system is broken when it is
 * working exactly as designed.
 *
 * Pure: nothing here queries, throws, or mutates its input.
 */

import {
  canSendTransfer,
  canReceiveTransfer,
  canTransitionTransfer,
  TRANSFER_STATUS_LABELS,
  type StockTransferStatus,
} from '@/lib/inventory/stock-transfer'
import type { BranchScope } from '@/lib/outlets/branch-scope'
import type { NamedBranch } from '@/lib/inventory/branch-stock-view'

/** Quantities are NUMERIC(16,4); anything under this is round-trip dust. */
const QUANTITY_EPSILON = 1e-4

/** The unbranched pool is a real place stock sits, so it gets a real name. */
const POOL_LABEL = 'Store pool'

/**
 * A branch the transfer names that is no longer in the list — deactivated or
 * deleted since. Naming it neutrally keeps the row readable; showing a raw id
 * or a blank would read as corruption of a document that is actually fine.
 */
const MISSING_BRANCH_LABEL = 'Former branch'

export interface TransferLineView {
  inventoryItemId: string
  name: string
  unit: string
  sentQuantity: number
  /** Null until somebody counts the delivery in. */
  receivedQuantity?: number | null
}

export interface TransferListItem {
  id: string
  status: StockTransferStatus
  fromOutletId: string | null
  toOutletId: string | null
  createdAt: string
  note?: string | null
  lines: readonly TransferLineView[]
}

/** The one thing this account may do to this transfer next. */
export type TransferAction = 'send' | 'receive' | 'cancel'

export interface TransferView extends TransferListItem {
  from: string
  to: string
  statusLabel: string
  itemCount: number
  /** Off one shelf and not yet on the other — the only urgent state. */
  isInTransit: boolean
  /** Lines where less arrived than left. Zero until it has been received. */
  shortfallCount: number
  actions: TransferAction[]
}

export interface TransferGroups {
  inTransit: TransferView[]
  drafts: TransferView[]
  history: TransferView[]
}

function branchLabel(outletId: string | null, branches: readonly NamedBranch[]): string {
  if (outletId === null) return POOL_LABEL
  return branches.find((branch) => branch.id === outletId)?.name ?? MISSING_BRANCH_LABEL
}

/** Both ends, named the way the merchant knows them. */
export function transferDirection(
  transfer: Pick<TransferListItem, 'fromOutletId' | 'toOutletId'>,
  branches: readonly NamedBranch[],
): { from: string; to: string } {
  return {
    from: branchLabel(transfer.fromOutletId, branches),
    to: branchLabel(transfer.toOutletId, branches),
  }
}

/**
 * What this account may do next.
 *
 * The status decides what is *possible* and the scope decides who may do it;
 * both have to agree, which is why each action asks the same two questions the
 * service will ask. Sending and cancelling are the sender's, because both act
 * on stock still on the sender's shelf. Receiving is the destination's alone.
 */
function availableActions(
  transfer: TransferListItem,
  scope: BranchScope,
): TransferAction[] {
  const actions: TransferAction[] = []
  const maySend = canSendTransfer(scope, transfer.fromOutletId)

  if (canTransitionTransfer(transfer.status, 'sent') && maySend) actions.push('send')
  if (canTransitionTransfer(transfer.status, 'received') && canReceiveTransfer(scope, transfer.toOutletId)) {
    actions.push('receive')
  }
  if (canTransitionTransfer(transfer.status, 'cancelled') && maySend) actions.push('cancel')

  return actions
}

/**
 * A shortfall is counted only once a delivery has actually been counted in.
 * An uncounted line is not a loss; it is a question nobody has asked yet, and
 * reporting it as missing stock would accuse the sender before anyone looked.
 */
function shortfallCount(lines: readonly TransferLineView[]): number {
  return lines.filter(
    (line) =>
      typeof line.receivedQuantity === 'number' &&
      line.sentQuantity - line.receivedQuantity > QUANTITY_EPSILON,
  ).length
}

export function describeTransfer(
  transfer: TransferListItem,
  scope: BranchScope,
  branches: readonly NamedBranch[],
): TransferView {
  return {
    ...transfer,
    ...transferDirection(transfer, branches),
    statusLabel: TRANSFER_STATUS_LABELS[transfer.status],
    itemCount: transfer.lines.length,
    isInTransit: transfer.status === 'sent',
    shortfallCount: shortfallCount(transfer.lines),
    actions: availableActions(transfer, scope),
  }
}

/**
 * Three lists, in the order they deserve attention.
 *
 * In-transit first because that stock is on nobody's shelf and every hour it
 * stays there is an hour two branches are both counting it wrong. Drafts are
 * intentions nothing has acted on. Everything finished is history — kept
 * because a shortfall is only explicable next to the document that recorded it.
 */
export function groupTransfers(
  transfers: readonly TransferListItem[],
  scope: BranchScope,
  branches: readonly NamedBranch[],
): TransferGroups {
  // Copied before sorting: `sort` mutates, and this list belongs to the caller.
  const views = transfers
    .map((transfer) => describeTransfer(transfer, scope, branches))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    inTransit: views.filter((view) => view.status === 'sent'),
    drafts: views.filter((view) => view.status === 'draft'),
    history: views.filter((view) => view.status === 'received' || view.status === 'cancelled'),
  }
}
