'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  blockerFix, etaAfterQueueing, sheetChoices, sheetDoneText, turnOnQuestion,
  type Blocker, type SheetChoice, type SheetMode,
} from '@/lib/texts/view/automations'
import { PACE_LINE } from '@/lib/texts/view/rules'
import { useTexts } from '../texts-context'
import { callAutomations, type BacklogValue, type PreviewValue } from './call-automations'

export interface TurnOnTarget {
  automationId: string
  name: string
  draft: Record<string, unknown>
  runMode: 'auto' | 'manual'
}

type Phase =
  | { kind: 'checking' }
  | { kind: 'ask'; queued: number; outlook: PreviewValue['outlook'] }
  | { kind: 'working'; queued: number; outlook: PreviewValue['outlook'] }
  | { kind: 'done'; text: string }
  | { kind: 'unreadable'; error: string }

interface TurnOnDialogProps {
  target: TurnOnTarget | null
  mode: SheetMode
  blocker: Blocker | null
  onFix: (blocker: Blocker) => void
  onClose: () => void
}

/** Asks the server who would be texted BEFORE anything is queued; the safe choice leads. */
export function TurnOnDialog({ target, mode, blocker, onFix, onClose }: TurnOnDialogProps) {
  const { tenantId, live, automations, rules, refresh } = useTexts()
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)

  useEffect(() => {
    if (!target || blocker) return
    const mine = ++request.current
    setPhase({ kind: 'checking' })
    setError(null)
    void callAutomations<PreviewValue>(tenantId, { action: 'preview', automation: target.draft }).then((result) => {
      if (mine !== request.current) return
      setPhase(result.ok ? { kind: 'ask', queued: result.value.now?.queued ?? 0, outlook: result.value.outlook } : { kind: 'unreadable', error: result.error })
    })
  }, [target, blocker, tenantId])

  const choose = async (choice: SheetChoice) => {
    if (!target || phase.kind !== 'ask') return
    const asked = phase
    setPhase({ ...asked, kind: 'working' })
    setError(null)
    const result = mode === 'run_now'
      ? await callAutomations<BacklogValue>(tenantId, { action: 'run_now', automationId: target.automationId })
      : await callAutomations<{ backlog: BacklogValue | null }>(tenantId, { action: 'set_status', automationId: target.automationId, status: 'on', sendBacklog: choice.sendBacklog })
    if (!result.ok) {
      setError(result.error)
      setPhase(asked)
      return
    }
    const backlog = 'backlog' in result.value ? result.value.backlog : (result.value as BacklogValue)
    const eta = backlog ? etaAfterQueueing(backlog.outlook, rules, 0, Date.now()) : ''
    setPhase({ kind: 'done', text: sheetDoneText(mode, backlog?.queued ?? 0, eta) })
    refresh()
  }

  const close = () => {
    if (phase.kind === 'working') return
    request.current += 1
    onClose()
  }

  const hasSender = automations.sender.enrolled > 0 || live.sender.phones.length > 0
  const isOnline = ['ready', 'sending', 'resting'].includes(live.sender.heroState)

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <p className="text-xs font-medium text-muted-foreground">{target?.name}</p>
        {blocker ? (
          <>
            <DialogTitle>{blocker.text}</DialogTitle>
            <DialogDescription>{blockerFix(blocker).why}</DialogDescription>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button type="button" className="min-h-11" onClick={() => onFix(blocker)}>{blockerFix(blocker).label}</Button>
              <Button type="button" variant="ghost" className="min-h-11" onClick={close}>Not now</Button>
            </div>
          </>
        ) : (
          <Body phase={phase} mode={mode} target={target} hasSender={hasSender} isOnline={isOnline} error={error} onChoose={(c) => void choose(c)} onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface BodyProps {
  phase: Phase
  mode: SheetMode
  target: TurnOnTarget | null
  hasSender: boolean
  isOnline: boolean
  error: string | null
  onChoose: (choice: SheetChoice) => void
  onClose: () => void
}

function Body({ phase, mode, target, hasSender, isOnline, error, onChoose, onClose }: BodyProps) {
  const { rules } = useTexts()
  if (phase.kind === 'checking') {
    return (
      <>
        <DialogTitle>Checking who qualifies…</DialogTitle>
        <DialogDescription className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> One moment.</DialogDescription>
      </>
    )
  }
  if (phase.kind === 'unreadable') {
    return (
      <>
        <DialogTitle>Couldn&apos;t check who qualifies</DialogTitle>
        <DialogDescription role="alert">{phase.error}</DialogDescription>
        <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>Close</Button>
      </>
    )
  }
  if (phase.kind === 'done') {
    return (
      <>
        <DialogTitle className="flex items-center gap-2"><CircleCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" /> Done</DialogTitle>
        <DialogDescription role="status">{phase.text}</DialogDescription>
        <Button type="button" className="min-h-11" onClick={onClose}>Done</Button>
      </>
    )
  }
  const question = turnOnQuestion(phase.queued)
  const { choices, note } = sheetChoices({ mode, queued: phase.queued, hasSender, isOnline, runMode: target?.runMode ?? 'auto' })
  const eta = etaAfterQueueing(phase.outlook, rules, phase.queued, Date.now())
  return (
    <>
      <DialogTitle>{question.title}</DialogTitle>
      <DialogDescription>{question.body}</DialogDescription>
      {phase.queued > 0 && <p className="text-sm text-muted-foreground">If you text them now: {eta}. {PACE_LINE.split('.')[0]}.</p>}
      {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{note}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-2">
        {choices.map((choice) => (
          <Button key={choice.label} type="button" className="min-h-11" variant={choice.tone === 'primary' ? 'default' : 'outline'} disabled={phase.kind === 'working'} onClick={() => onChoose(choice)}>
            {phase.kind === 'working' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {choice.label}
          </Button>
        ))}
        <Button type="button" variant="ghost" className="min-h-11" disabled={phase.kind === 'working'} onClick={onClose}>Not now</Button>
      </div>
    </>
  )
}
