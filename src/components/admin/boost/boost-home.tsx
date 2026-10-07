'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  saveBoostLastCallAction,
  setBoostComboActiveAction,
  setBoostEnabledAction,
  setBoostPairingActiveAction,
  setBoostUpgradeActiveAction,
} from '@/app/actions/boost'
import { markBoostAiProposalAppliedAction } from '@/app/actions/boost-ai'
import type { BoostAiLog, BoostAiProposal } from '@/lib/boost/ai/store'
import type { BoostIdea } from '@/lib/boost/ideas'
import type { BoostWorkspace } from '@/lib/boost/workspace'
import type { OfferTheme } from '@/components/customer/offers/offer-theme'
import { BoostWelcome } from './boost-welcome'
import { BoostJourney, type MomentStatus } from './boost-journey'
import { BoostIdeas } from './boost-ideas'
import { OfferSections, offerKey } from './boost-offers'
import { OfferEditorSheet } from './offer-editor-sheet'
import { activateIdea } from './idea-activation'
import { BoostAiPanel } from './ai/boost-ai-panel'
import { peso, type BoostMoment, type EditorTarget, type OfferKind } from './boost-model'

export interface BoostHomeProps {
  workspace: BoostWorkspace
  tenantId: string
  tenantSlug: string
  theme: OfferTheme
  cartTheme: OfferTheme
  initialEditor?: EditorTarget | null
  /** The AI generation log; null when it could not be read. */
  aiLog: BoostAiLog | null
  /** Server-rendered "Picked together" analytics, streamed in. */
  insights?: ReactNode
}

const dismissedKey = (tenantId: string) => `boost:dismissed-ideas:${tenantId}`

function readDismissed(tenantId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(dismissedKey(tenantId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeDismissed(tenantId: string, ids: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(dismissedKey(tenantId), JSON.stringify([...ids]))
  } catch {
    // Private mode or blocked storage: the idea simply comes back next visit.
  }
}

function newTarget(kind: OfferKind, fromIdea?: BoostIdea): EditorTarget {
  switch (kind) {
    case 'combo': return { kind, comboId: null, fromIdea }
    case 'upgrade': return { kind, upgradeId: null, fromIdea }
    case 'pairing': return { kind, groupKey: null, fromIdea }
    case 'last_call': return { kind, fromIdea }
  }
}

function countStatus(total: number, live: number): MomentStatus {
  if (total === 0) return { label: 'Not set up', isActive: false }
  if (live === 0) return { label: 'All paused', isActive: false }
  return { label: `${live} live`, isActive: true }
}

export function BoostHome({
  workspace, tenantId, tenantSlug, theme, cartTheme, initialEditor = null, aiLog, insights,
}: BoostHomeProps) {
  const [editor, setEditor] = useState<EditorTarget | null>(initialEditor)
  /** The approved AI proposal being edited; saving the editor puts it live. */
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null)
  const [liveOverrides, setLiveOverrides] = useState<Record<string, boolean>>({})
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [busyIdeaId, setBusyIdeaId] = useState<string | null>(null)
  const [isEnabling, setIsEnabling] = useState(false)
  const [isConfirmingOff, setConfirmingOff] = useState(false)

  const itemsById = useMemo(() => new Map(workspace.items.map((item) => [item.id, item])), [workspace.items])

  useEffect(() => setDismissed(readDismissed(tenantId)), [tenantId])
  // Fresh server data supersedes every optimistic toggle.
  useEffect(() => setLiveOverrides({}), [workspace])

  const visibleIdeas = useMemo(
    () => workspace.ideas.filter((idea) => !dismissed.has(idea.id)),
    [workspace.ideas, dismissed]
  )

  const live = useCallback((key: string, stored: boolean) => liveOverrides[key] ?? stored, [liveOverrides])
  const liveCounts = {
    combos: workspace.combos.filter((c) => live(offerKey.combo(c.id), c.is_active)).length,
    upgrades: workspace.upgrades.filter((u) => live(offerKey.upgrade(u.id), u.isActive)).length,
    pairings: workspace.pairings.filter((g) => live(offerKey.pairing(g.key), g.isActive)).length,
    lastCall: live(offerKey.lastCall, workspace.lastCall.enabled),
  }
  const totalLive = liveCounts.combos + liveCounts.upgrades + liveCounts.pairings + (liveCounts.lastCall ? 1 : 0)

  const journeyStatus: Record<BoostMoment, MomentStatus> = {
    menu: countStatus(workspace.combos.length, liveCounts.combos),
    item: countStatus(workspace.upgrades.length, liveCounts.upgrades),
    added: countStatus(workspace.pairings.length, liveCounts.pairings),
    cart: liveCounts.lastCall
      ? { label: workspace.lastCall.pickedItemIds.length ? 'On · your picks' : 'On · automatic', isActive: true }
      : { label: 'Off', isActive: false },
  }

  const performance = workspace.performance
  const suggestionRevenue = performance?.suggestions.revenue ?? 0
  const comboOrderCount = performance ? Object.values(performance.comboOrders).reduce((sum, n) => sum + n, 0) : 0

  // No router.refresh() after a write: every Boost action ends in
  // refreshOfferCaches → revalidatePath, and a revalidating Server Action
  // already returns this page freshly rendered. A refresh on top rendered it a
  // SECOND time — order history, menu and AI log included — per click.

  const handleSaved = useCallback(async (message: string) => {
    setEditor(null)
    toast.success(message)
    if (editingProposalId) {
      setEditingProposalId(null)
      const response = await markBoostAiProposalAppliedAction(tenantId, tenantSlug, editingProposalId)
      if (!response.success) toast.error(response.error)
    }
  }, [editingProposalId, tenantId, tenantSlug])

  const closeEditor = useCallback(() => {
    setEditor(null)
    setEditingProposalId(null)
  }, [])

  const editProposal = useCallback((proposal: BoostAiProposal) => {
    setEditingProposalId(proposal.id)
    setEditor(newTarget(proposal.idea.kind, proposal.idea))
  }, [])

  const handleToggle = async (key: string, isLive: boolean) => {
    setLiveOverrides((current) => ({ ...current, [key]: isLive }))
    const [kind, ...rest] = key.split(':')
    const id = rest.join(':')
    const response = kind === 'combo'
      ? await setBoostComboActiveAction(tenantId, tenantSlug, id, isLive)
      : kind === 'upgrade'
        ? await setBoostUpgradeActiveAction(tenantId, tenantSlug, id, isLive)
        : kind === 'pairing'
          ? await setBoostPairingActiveAction(
              tenantId,
              tenantSlug,
              workspace.pairings.find((group) => group.key === id)?.sourceIds ?? [],
              isLive
            )
          : await saveBoostLastCallAction(tenantId, tenantSlug, { ...workspace.lastCall, enabled: isLive })

    if (!response.success) {
      setLiveOverrides((current) => ({ ...current, [key]: !isLive }))
      toast.error(response.error)
      return
    }
    toast.success(isLive ? 'Live for customers' : 'Paused — customers no longer see it')
  }

  const handleActivate = async (idea: BoostIdea) => {
    setBusyIdeaId(idea.id)
    const result = await activateIdea(idea, { tenantId, tenantSlug, itemsById, lastCall: workspace.lastCall })
    setBusyIdeaId(null)
    if (result.status === 'needs-edit') {
      setEditor(newTarget(idea.kind, idea))
      return
    }
    if (result.status === 'failed') {
      toast.error(result.error)
      return
    }
    toast.success(result.message, {
      action: {
        label: 'Undo',
        onClick: async () => {
          await result.undo()
        },
      },
    })
  }

  const handleDismiss = (idea: BoostIdea) => {
    const next = new Set(dismissed).add(idea.id)
    setDismissed(next)
    writeDismissed(tenantId, next)
    toast('Idea hidden', {
      action: {
        label: 'Undo',
        onClick: () => {
          setDismissed((current) => {
            const restored = new Set(current)
            restored.delete(idea.id)
            writeDismissed(tenantId, restored)
            return restored
          })
        },
      },
    })
  }

  const setEnabled = async (enabled: boolean) => {
    setIsEnabling(true)
    const response = await setBoostEnabledAction(tenantId, tenantSlug, enabled)
    setIsEnabling(false)
    setConfirmingOff(false)
    if (!response.success) {
      toast.error(response.error)
      return
    }
    toast.success(enabled ? 'Boost Sales is on' : 'Boost Sales is off — your offers are kept for later')
  }

  const sheet = (
    <OfferEditorSheet
      target={editor}
      workspace={workspace}
      environment={{
        tenantId,
        tenantSlug,
        items: workspace.items,
        itemsById,
        theme,
        cartTheme,
        onSaved: handleSaved,
      }}
      onChoose={(kind) => setEditor(newTarget(kind))}
      onClose={closeEditor}
    />
  )

  if (!workspace.isEnabled) {
    return (
      <div className="mx-auto max-w-5xl">
        <BoostWelcome
          ideas={workspace.ideas}
          itemsById={itemsById}
          canEnable
          isEnabling={isEnabling}
          onEnable={() => setEnabled(true)}
        />
      </div>
    )
  }

  const summary = [
    totalLive === 0 ? 'No offers live yet' : `${totalLive} offer${totalLive === 1 ? '' : 's'} live`,
    suggestionRevenue > 0 && performance ? `${peso(suggestionRevenue)} added from suggestions in ${performance.days} days` : null,
    comboOrderCount > 0 && performance ? `combos in ${comboOrderCount} order${comboOrderCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Boost Sales</h1>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setEditor({ kind: 'choose' })} className="rounded-full">
            <Plus className="mr-1.5 h-4 w-4" />
            New offer
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More options">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setConfirmingOff(true)} className="text-destructive">
                Turn off Boost Sales
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <BoostJourney status={journeyStatus} />

      <BoostAiPanel
        log={aiLog}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        itemsById={itemsById}
        onEdit={editProposal}
      />

      <BoostIdeas
        ideas={visibleIdeas}
        itemsById={itemsById}
        historyOrders={workspace.historyOrders}
        busyId={busyIdeaId}
        onActivate={handleActivate}
        onEdit={(idea) => setEditor(newTarget(idea.kind, idea))}
        onDismiss={handleDismiss}
      />

      <OfferSections
        combos={workspace.combos}
        upgrades={workspace.upgrades}
        pairings={workspace.pairings}
        lastCall={workspace.lastCall}
        itemsById={itemsById}
        performance={performance}
        liveOverrides={liveOverrides}
        onToggle={handleToggle}
        onEditCombo={(comboId) => setEditor({ kind: 'combo', comboId })}
        onEditUpgrade={(upgradeId) => setEditor({ kind: 'upgrade', upgradeId })}
        onEditPairing={(groupKey) => setEditor({ kind: 'pairing', groupKey })}
        onEditLastCall={() => setEditor({ kind: 'last_call' })}
        onCreate={(moment) => setEditor(newTarget(({ menu: 'combo', item: 'upgrade', added: 'pairing', cart: 'last_call' } as const)[moment]))}
      />

      {insights}

      {sheet}

      <AlertDialog open={isConfirmingOff} onOpenChange={setConfirmingOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off Boost Sales?</AlertDialogTitle>
            <AlertDialogDescription>
              Customers stop seeing every combo, upgrade and suggestion right away. Everything you set up is kept, so
              turning it back on restores it exactly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isEnabling}>Keep it on</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void setEnabled(false)
              }}
              disabled={isEnabling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isEnabling ? 'Turning off…' : 'Turn off'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
