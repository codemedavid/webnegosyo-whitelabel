'use client'

import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { CampaignListItem, CampaignRunProgress } from '@/lib/texts/types'
import type { CampaignAction } from '@/lib/texts/view/campaigns'
import { finishText, toMs } from '@/lib/texts/view/time'
import { ConfirmDialog } from '../confirm-dialog'
import { DEMO_READONLY, runAction } from '../run-action'
import { useTexts } from '../texts-context'
import { useConfirm } from '../use-confirm'
import { useTextsActions } from '../texts-actions'

type Run = (action: CampaignAction, item: CampaignListItem) => void

const CampaignActionsContext = createContext<Run | null>(null)

export function useCampaignActions(): Run {
  const run = useContext(CampaignActionsContext)
  if (!run) throw new Error('useCampaignActions must be used inside CampaignActionsProvider')
  return run
}

function pauseBody(progress: CampaignRunProgress | null): string {
  if (!progress || progress.sent === 0) return 'Nothing more goes out until you resume.'
  const rest = Math.max(0, progress.total - progress.sent - progress.notSent)
  return `${progress.sent} guests already got it. The other ${rest} won't, until you resume.`
}

/**
 * Every campaign action (row menus, the report sheet, the Sending now card)
 * runs here, so each confirm and toast is worded once. One action per
 * campaign at a time: a double tap on Duplicate makes one copy.
 */
export function CampaignActionsProvider({ children }: { children: ReactNode }) {
  const { tenantId, isDemo, live, setUrl, refresh } = useTexts()
  const { ask, dialogProps } = useConfirm()
  const inFlight = useRef(new Set<string>())
  const actions = useTextsActions()

  const once = useCallback(async (key: string, work: () => Promise<void>) => {
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    try {
      await work()
    } finally {
      inFlight.current.delete(key)
    }
  }, [])

  const run = useCallback<Run>((action, item) => {
    if (action === 'view') return setUrl({ campaign: item.id, edit: false, isReport: true })
    if (action === 'edit') return setUrl({ campaign: item.id, edit: true, isReport: false })
    if (isDemo) return void toast.info(DEMO_READONLY)
    const key = `${action}:${item.id}`
    const progress = live.progress[item.id] ?? null
    switch (action) {
      case 'pause':
        return ask({
          title: `Pause ${item.name}?`, body: pauseBody(progress), cancelLabel: 'Keep sending', confirmLabel: 'Pause',
          onConfirm: () => once(key, async () => {
            const done = await runAction(() => actions.pauseCampaignAction(tenantId, item.id), "Couldn't pause. Try again. Texts already sent can't be taken back.")
            if (done !== null) { toast.success('Paused.'); refresh() }
          }),
        })
      case 'resume':
        return void once(key, async () => {
          const done = await runAction(() => actions.resumeCampaignAction(tenantId, item.id))
          if (done === null) return
          const finish = toMs(progress?.finishAt ?? null)
          toast.success(finish === null ? 'Resumed. It picks up where it left off.' : `Resumed. Done ${finishText(finish, Date.now())}.`)
          refresh()
        })
      case 'delete':
        return ask({
          title: 'Delete this draft?', body: "It's gone for good. Campaigns you've sent are kept.",
          cancelLabel: 'Keep it', confirmLabel: 'Delete', isDestructive: true,
          onConfirm: () => once(key, async () => {
            const done = await runAction(() => actions.deleteCampaignDraftAction(tenantId, item.id))
            if (done !== null) { toast.success('Draft deleted.'); setUrl({ campaign: null }); refresh() }
          }),
        })
      case 'archive':
        return void once(key, async () => {
          const done = await runAction(() => actions.archiveCampaignAction(tenantId, item.id))
          if (done === null) return
          refresh()
          toast.success('Archived. Find it under Archived.', {
            action: { label: 'Undo', onClick: () => void runAction(() => actions.unarchiveCampaignAction(tenantId, item.id)).then((v) => v !== null && refresh()) },
          })
        })
      case 'unarchive':
        return void once(key, async () => {
          const done = await runAction(() => actions.unarchiveCampaignAction(tenantId, item.id))
          if (done !== null) { toast.success('Back in your list.'); refresh() }
        })
      case 'duplicate':
        return void once(key, async () => {
          const value = await runAction(() => actions.duplicateCampaignAction(tenantId, item.id))
          if (!value) return
          refresh()
          setUrl({ campaign: value.id, edit: true, isReport: false })
        })
      case 'switch_to_automatic':
        return ask({
          title: 'Let it send by itself?',
          body: "From now on it goes out on its schedule through your sending phone. You won't need to tap Send in the app.",
          cancelLabel: 'Keep sending it from the app', confirmLabel: 'Let it send by itself',
          onConfirm: () => once(key, async () => {
            const done = await runAction(() => actions.switchToAutomaticAction(tenantId, item.id))
            if (done !== null) { toast.success('It sends by itself now.'); refresh() }
          }),
        })
    }
  }, [actions, ask, isDemo, live.progress, once, refresh, setUrl, tenantId])

  return (
    <CampaignActionsContext.Provider value={run}>
      {children}
      <ConfirmDialog {...dialogProps} />
    </CampaignActionsContext.Provider>
  )
}
