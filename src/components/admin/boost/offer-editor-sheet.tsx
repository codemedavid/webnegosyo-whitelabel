'use client'

import { ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import type { BoostWorkspace } from '@/lib/boost/workspace'
import { BOOST_MOMENTS, type EditorTarget, type OfferKind } from './boost-model'
import type { EditorEnvironment } from './editor-types'
import { ComboEditor } from './combo-editor'
import { UpgradeEditor } from './upgrade-editor'
import { PairingEditor } from './pairing-editor'
import { LastCallEditor } from './last-call-editor'

interface OfferEditorSheetProps {
  target: EditorTarget | null
  workspace: BoostWorkspace
  environment: Omit<EditorEnvironment, 'onClose'>
  onChoose: (kind: OfferKind) => void
  onClose: () => void
}

/**
 * Every create and edit happens in this one sheet: right-hand panel on a
 * laptop, full screen on a phone. Replaces a five-step full-page bundle
 * wizard, a three-step inline upgrade wizard, a rules dialog and an
 * auto-saving grid — four different ways to do the same kind of thing.
 */
export function OfferEditorSheet({ target, workspace, environment, onChoose, onClose }: OfferEditorSheetProps) {
  const env: EditorEnvironment = { ...environment, onClose }
  const isChooser = target?.kind === 'choose'

  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        hideCloseButton
        className={isChooser ? 'w-full gap-0 p-0 sm:max-w-md' : 'w-full gap-0 p-0 sm:max-w-[640px] lg:max-w-[1020px]'}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {target && renderBody(target, workspace, env, onChoose)}
      </SheetContent>
    </Sheet>
  )
}

function renderBody(
  target: EditorTarget,
  workspace: BoostWorkspace,
  env: EditorEnvironment,
  onChoose: (kind: OfferKind) => void
) {
  switch (target.kind) {
    case 'choose':
      return <OfferChooser onChoose={onChoose} onClose={env.onClose} />
    case 'combo':
      return (
        <ComboEditor
          key={target.comboId ?? target.fromIdea?.id ?? 'new'}
          {...env}
          combo={workspace.combos.find((combo) => combo.id === target.comboId) ?? null}
          idea={target.fromIdea}
        />
      )
    case 'upgrade':
      return (
        <UpgradeEditor
          key={target.upgradeId ?? target.fromIdea?.id ?? 'new'}
          {...env}
          upgrade={workspace.upgrades.find((upgrade) => upgrade.id === target.upgradeId) ?? null}
          idea={target.fromIdea}
          takenSourceIds={new Set(workspace.upgrades.map((upgrade) => upgrade.sourceId))}
        />
      )
    case 'pairing':
      return (
        <PairingEditor
          key={target.groupKey ?? target.fromIdea?.id ?? 'new'}
          {...env}
          group={workspace.pairings.find((group) => group.key === target.groupKey) ?? null}
          idea={target.fromIdea}
          takenSourceIds={new Set(workspace.pairings.flatMap((group) => group.sourceIds))}
        />
      )
    case 'last_call': {
      // An AI suggestion opens the editor on its own picks and copy.
      const settings = target.fromIdea?.kind === 'last_call' ? target.fromIdea.settings : undefined
      const lastCall = settings ? { ...workspace.lastCall, ...settings, enabled: true } : workspace.lastCall
      return <LastCallEditor key={target.fromIdea?.id ?? 'current'} {...env} lastCall={lastCall} />
    }
  }
}

function OfferChooser({ onChoose, onClose }: { onChoose: (kind: OfferKind) => void; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-lg font-semibold">New offer</SheetTitle>
          <SheetDescription className="text-sm">Pick the moment you want to sell more.</SheetDescription>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
      </header>
      <ul className="flex-1 space-y-2 overflow-y-auto p-4">
        {BOOST_MOMENTS.map((moment) => {
          const Icon = moment.icon
          return (
            <li key={moment.id}>
              <button
                type="button"
                onClick={() => onChoose(moment.kind)}
                className="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors hover:border-foreground/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{moment.offer}</span>
                  <span className="block text-xs font-medium text-muted-foreground">{moment.place}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{moment.blurb}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
