'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ChevronDown, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  applyBoostAiProposalAction,
  decideBoostAiProposalAction,
  generateBoostAiAction,
} from '@/app/actions/boost-ai'
import type { BoostAiGeneration, BoostAiLog, BoostAiProposal } from '@/lib/boost/ai/store'
import { generationsLeft } from '@/lib/boost/ai/lifecycle'
import type { ItemLookup } from '../boost-model'
import { AiProposalCard, type ProposalAction } from './ai-proposal-card'

interface BoostAiPanelProps {
  /** null when the log could not be read (e.g. the feature is not set up on this server yet). */
  log: BoostAiLog | null
  tenantId: string
  tenantSlug: string
  itemsById: ItemLookup
  /** Open the offer editor on an approved proposal; saving it marks it applied. */
  onEdit: (proposal: BoostAiProposal) => void
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function generationLine(generation: BoostAiGeneration): string {
  if (generation.status === 'failed') return 'Did not finish — not counted'
  if (generation.status === 'running') return 'Working…'
  const counts = generation.proposals.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {})
  const parts = [
    `${generation.proposals.length} suggestion${generation.proposals.length === 1 ? '' : 's'}`,
    counts.pending ? `${counts.pending} to review` : null,
    counts.approved ? `${counts.approved} approved` : null,
    counts.applied ? `${counts.applied} live` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

function generationTitle(generation: BoostAiGeneration): string {
  return generation.source === 'launch' ? 'Your launch combos' : formatWhen(generation.createdAt)
}

/** Open what still needs a decision (launch combos included), else the newest run. */
function initiallyOpen(log: BoostAiLog | null): Set<string> {
  const waiting = (log?.generations ?? []).filter((generation) => generation.proposals.some((p) => p.status === 'pending' || p.status === 'approved'))
  const first = log?.generations[0]
  return new Set(waiting.length > 0 ? waiting.map((generation) => generation.id) : first ? [first.id] : [])
}

function historyLine(generation: BoostAiGeneration): string | null {
  if (generation.source === 'launch') return 'They wait for your OK: approve the ones you like and they go on your menu.'
  if (generation.status !== 'succeeded') return null
  if (generation.ordersAnalyzed === 0) return 'Built from your menu (no order history yet).'
  return `Learned from ${generation.ordersAnalyzed.toLocaleString('en-PH')} of your orders.`
}

/**
 * "Generate with AI": the AI reads the menu and real order baskets and drafts
 * combos, upgrades, pairings and a cart last call. Every run is logged; every
 * suggestion needs an approval before it can be applied, and can be applied
 * any time after.
 */
export function BoostAiPanel({ log, tenantId, tenantSlug, itemsById, onEdit }: BoostAiPanelProps) {
  const router = useRouter()
  const [isGenerating, setGenerating] = useState(false)
  const [busy, setBusy] = useState<{ id: string; action: ProposalAction } | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(() => initiallyOpen(log))

  if (!log) {
    return (
      <section className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
        AI suggestions are not available right now. Please try again later.
      </section>
    )
  }

  const left = generationsLeft(log.used, log.limit)
  const isLocked = isGenerating || busy !== null

  const generate = async () => {
    setGenerating(true)
    const response = await generateBoostAiAction(tenantId, tenantSlug)
    setGenerating(false)
    if (!response.success) {
      toast.error(response.error)
      router.refresh()
      return
    }
    if (response.data) setOpenIds(new Set([response.data.generationId]))
    toast.success(`${response.data?.proposals ?? 0} suggestions ready — review and approve the ones you like`)
    router.refresh()
  }

  const handleAction = async (proposal: BoostAiProposal, action: ProposalAction) => {
    if (action === 'edit') {
      onEdit(proposal)
      return
    }
    setBusy({ id: proposal.id, action })
    const response = action === 'apply'
      ? await applyBoostAiProposalAction(tenantId, tenantSlug, proposal.id)
      : await decideBoostAiProposalAction(tenantId, tenantSlug, proposal.id, action)
    setBusy(null)

    if (!response.success) {
      toast.error(response.error)
      router.refresh()
      return
    }
    if (action === 'apply' && response.data && 'status' in response.data && response.data.status === 'needs-edit') {
      toast('This one needs a small edit before it can go live')
      onEdit(proposal)
      return
    }
    toast.success(action === 'apply' ? 'Live for customers' : action === 'approve' ? 'Approved — apply it whenever you are ready' : 'Rejected')
    router.refresh()
  }

  const toggle = (id: string) => setOpenIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <section aria-labelledby="boost-ai-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border bg-gradient-to-br from-violet-50 to-transparent p-4 dark:from-violet-950/30 sm:p-5">
        <div className="flex min-w-0 max-w-xl items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="boost-ai-title" className="text-base font-semibold">Generate with AI</h2>
            <p className="text-sm text-muted-foreground">
              AI reads your menu and what customers order together, then drafts combos, upgrades, pairings and a cart
              last call. Nothing goes live until you approve and apply it.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <Button type="button" onClick={generate} disabled={isLocked || left === 0} className="rounded-full">
            {isGenerating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            {isGenerating ? 'Reading your orders…' : 'Generate suggestions'}
          </Button>
          <span className="text-center text-xs text-muted-foreground sm:text-right">
            {left === 0 ? `All ${log.limit} free generations used` : `${left} of ${log.limit} free generations left`}
          </span>
        </div>
      </div>

      {isGenerating && (
        <p role="status" className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
          Reading your menu and orders and drafting offers — this can take up to a minute. Keep this page open.
        </p>
      )}

      {log.generations.length > 0 && (
        <div>
          <h3 id="boost-ai-log" className="mb-2 scroll-mt-20 text-sm font-semibold">Generation log</h3>
          <ol className="space-y-2">
            {log.generations.map((generation) => {
              const isOpen = openIds.has(generation.id)
              const canOpen = generation.status === 'succeeded' && generation.proposals.length > 0
              return (
                <li key={generation.id} className="rounded-2xl border">
                  <button
                    type="button"
                    onClick={() => canOpen && toggle(generation.id)}
                    aria-expanded={canOpen ? isOpen : undefined}
                    className={cn('flex w-full items-center gap-3 px-4 py-3 text-left', canOpen && 'hover:bg-muted/40')}
                  >
                    {generation.status === 'failed' && <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{generationTitle(generation)}</span>
                      <span className="block text-xs text-muted-foreground">{generationLine(generation)}</span>
                    </span>
                    {canOpen && <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />}
                  </button>
                  {generation.status === 'failed' && generation.error && (
                    <p className="px-4 pb-3 text-xs text-muted-foreground">{generation.error}</p>
                  )}
                  {canOpen && isOpen && (
                    <div className="space-y-3 border-t px-4 py-4">
                      {(generation.summary || historyLine(generation)) && (
                        <p className="text-sm text-muted-foreground">
                          {[generation.summary, historyLine(generation)].filter(Boolean).join(' ')}
                        </p>
                      )}
                      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {generation.proposals.map((proposal) => (
                          <AiProposalCard
                            key={proposal.id}
                            proposal={proposal}
                            itemsById={itemsById}
                            busyAction={busy?.id === proposal.id ? busy.action : null}
                            isLocked={isLocked}
                            onAction={handleAction}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
