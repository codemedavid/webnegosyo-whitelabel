'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { blockerFor, type Automation, type Blocker, type SheetMode } from '@/lib/texts/view/automations'
import { draftFromAutomation, toApiDraft } from '@/lib/texts/view/automation-editor'
import { ConfirmDialog } from '../confirm-dialog'
import { DEMO_READONLY, runAction } from '../run-action'
import { useTexts } from '../texts-context'
import { useConfirm } from '../use-confirm'
import { callAutomations } from './call-automations'
import { TurnOnDialog, type TurnOnTarget } from './turn-on-dialog'
import { useTextsActions } from '../texts-actions'

export function targetOf(automation: Automation): TurnOnTarget {
  return { automationId: automation.id, name: automation.name, draft: toApiDraft(draftFromAutomation(automation)), runMode: automation.runMode }
}

/**
 * On asks first (TurnOnDialog), off confirms that waiting texts are
 * withdrawn, and a blocked recipe shows its one fix instead of the API.
 * Same flow as the merchant app's useAutomationSwitch.
 */
export function useAutomationSwitch() {
  const { tenantId, tenantSlug, isDemo, automations, setUrl, refresh } = useTexts()
  const router = useRouter()
  const actions = useTextsActions()
  const [sheet, setSheet] = useState<{ target: TurnOnTarget; mode: SheetMode; blocker: Blocker | null } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { ask, dialogProps } = useConfirm()

  const open = useCallback((target: TurnOnTarget, mode: SheetMode, recipe: Automation['recipe']) => {
    if (isDemo) return void toast.info(DEMO_READONLY)
    setSheet({ target, mode, blocker: blockerFor(recipe, automations) })
  }, [isDemo, automations])

  const turnOn = useCallback((automation: Automation) => open(targetOf(automation), 'turn_on', automation.recipe), [open])
  const runNow = useCallback((automation: Automation) => open(targetOf(automation), 'run_now', automation.recipe), [open])

  const turnOff = useCallback((automation: Automation) => {
    if (isDemo) return void toast.info(DEMO_READONLY)
    ask({
      title: 'Stop sending?', body: 'Texts still waiting are withdrawn.', cancelLabel: 'Keep it on', confirmLabel: 'Turn off', isDestructive: true,
      onConfirm: async () => {
        setBusyId(automation.id)
        const done = await runAction(() => callAutomations(actions, tenantId, { action: 'set_status', automationId: automation.id, status: 'off' }), "Couldn't turn it off. Try again.")
        setBusyId(null)
        if (done !== null) refresh()
      },
    })
  }, [actions, ask, isDemo, refresh, tenantId])

  const fix = useCallback((blocker: Blocker) => {
    setSheet(null)
    if (blocker.kind === 'review_link') setUrl({ tab: 'rules', focus: 'review_link', automatic: null })
    else router.push(`/${tenantSlug}/admin/loyalty`)
  }, [router, setUrl, tenantSlug])

  const dialogs = (
    <>
      <TurnOnDialog target={sheet?.target ?? null} mode={sheet?.mode ?? 'turn_on'} blocker={sheet?.blocker ?? null} onFix={fix} onClose={() => setSheet(null)} />
      <ConfirmDialog {...dialogProps} />
    </>
  )

  return { turnOn, turnOff, runNow, open, busyId, dialogs }
}
