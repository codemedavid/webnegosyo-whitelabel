'use client'

import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BoostAiProposal } from '@/lib/boost/ai/store'
import type { ProposalStatus } from '@/lib/boost/ai/lifecycle'
import { DishStack } from '../dish'
import { MOMENT_BY_KIND, describeIdea, type ItemLookup } from '../boost-model'

export type ProposalAction = 'approve' | 'reject' | 'apply' | 'edit'

interface AiProposalCardProps {
  proposal: BoostAiProposal
  itemsById: ItemLookup
  busyAction: ProposalAction | null
  isLocked: boolean
  onAction: (proposal: BoostAiProposal, action: ProposalAction) => void
}

const STATUS: Record<ProposalStatus, { label: string; className: string }> = {
  pending: { label: 'Needs review', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' },
  approved: { label: 'Approved', className: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100' },
  rejected: { label: 'Rejected', className: 'bg-muted text-muted-foreground' },
  applied: { label: 'Live', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100' },
}

function ActionButton({
  action, label, busyAction, isLocked, variant = 'default', onClick,
}: {
  action: ProposalAction
  label: string
  busyAction: ProposalAction | null
  isLocked: boolean
  variant?: 'default' | 'outline' | 'ghost'
  onClick: () => void
}) {
  return (
    <Button type="button" size="sm" variant={variant} onClick={onClick} disabled={isLocked}>
      {busyAction === action && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
      {label}
    </Button>
  )
}

/** One AI-proposed offer, with only the next steps its status allows. */
export function AiProposalCard({ proposal, itemsById, busyAction, isLocked, onAction }: AiProposalCardProps) {
  const { idea, status } = proposal
  const { title, detail } = describeIdea(idea, itemsById)
  const moment = MOMENT_BY_KIND[idea.kind]
  const Icon = moment.icon
  const chip = STATUS[status]
  const act = (action: ProposalAction) => () => onAction(proposal, action)
  const shared = { busyAction, isLocked }

  return (
    <li className={cn('flex flex-col rounded-2xl border bg-card p-4', status === 'rejected' && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <DishStack items={idea.itemIds.map((id) => itemsById.get(id))} size="md" />
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{moment.offer}</span>
          </span>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', chip.className)}>
          {status === 'applied' && <Check className="h-3 w-3" aria-hidden="true" />}
          {chip.label}
        </span>
      </div>
      <h4 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-snug">{title}</h4>
      <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{detail}</p>
      <p className="mt-2 flex-1 text-xs text-muted-foreground">{idea.reason}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === 'pending' && (
          <>
            <ActionButton action="approve" label="Approve" {...shared} onClick={act('approve')} />
            <ActionButton action="reject" label="Reject" variant="outline" {...shared} onClick={act('reject')} />
          </>
        )}
        {status === 'approved' && (
          <>
            <ActionButton action="apply" label="Apply now" {...shared} onClick={act('apply')} />
            <ActionButton action="edit" label="Edit first" variant="outline" {...shared} onClick={act('edit')} />
            <ActionButton action="reject" label="Reject" variant="ghost" {...shared} onClick={act('reject')} />
          </>
        )}
        {status === 'rejected' && (
          <ActionButton action="approve" label="Approve instead" variant="outline" {...shared} onClick={act('approve')} />
        )}
        {status === 'applied' && (
          <p className="text-xs text-muted-foreground">
            Live{proposal.appliedAt ? ` since ${new Date(proposal.appliedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}` : ''} — pause or edit it below.
          </p>
        )}
      </div>
    </li>
  )
}
