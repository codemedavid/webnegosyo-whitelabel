'use client'

import { useEffect, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { RecipeInfo, Automation } from '@/lib/texts/view/automations'
import {
  automationMessageProblem, draftFromAutomation, draftFromRecipe, renderAutomationSample, RUN_MODE_OPTIONS, toApiDraft,
  type AutomationDraft,
} from '@/lib/texts/view/automation-editor'
import { RadioChips } from '../radio-chips'
import { DEMO_READONLY, runAction } from '../run-action'
import { SheetFrame, useDirtyCloseGuard } from '../sheet-frame'
import { useUnloadGuard } from '../use-unload-guard'
import { useTexts } from '../texts-context'
import { AutomationMessage } from './automation-message'
import { recipeTitle } from './automation-card'
import { callAutomations } from './call-automations'
import { KnobSentence } from './knob-sentence'
import { PhonePreview } from '../composer/phone-preview'
import { useAutomationSwitch } from './use-automation-switch'
import { useTextsActions } from '../texts-actions'

/** `?automatic=<recipe>`: the sentence, the message, how it runs, and a preview. */
export function AutomationEditorSheet() {
  const { url, setUrl, automations } = useTexts()
  const info = automations.recipes.find((recipe) => recipe.id === url.automatic) ?? null
  const saved = info ? automations.automations.find((a) => a.recipe === info.id) ?? null : null
  const { isDirty, setDirty, armRequest, guard } = useDirtyCloseGuard()
  // Lives here, outside the editor, so the turn-on dialog survives the page re-reading itself.
  const flow = useAutomationSwitch()
  const close = () => { setDirty(false); setUrl({ automatic: null }) }

  return (
    <Sheet open={info !== null} onOpenChange={(open) => !open && !isDirty && close()}>
      <SheetContent side="right" hideCloseButton className="w-full gap-0 p-0 sm:max-w-[640px] lg:max-w-[1020px]"
        onEscapeKeyDown={guard} onPointerDownOutside={guard} onInteractOutside={guard}>
        {info && <Editor key={info.id} info={info} saved={saved} flow={flow} armRequest={armRequest} onClose={close} onDirtyChange={setDirty} />}
        {flow.dialogs}
      </SheetContent>
    </Sheet>
  )
}

interface EditorProps {
  info: RecipeInfo
  saved: Automation | null
  flow: ReturnType<typeof useAutomationSwitch>
  armRequest: number
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
}

function Editor({ info, saved, flow, armRequest, onClose, onDirtyChange }: EditorProps) {
  const { tenantId, isDemo, storeName, tenantSlug, refresh } = useTexts()
  const actions = useTextsActions()
  const [initial, setInitial] = useState<AutomationDraft>(() => (saved ? draftFromAutomation(saved) : draftFromRecipe(info)))
  const [draft, setDraft] = useState(initial)
  const [isSaving, setSaving] = useState(false)
  const isDirty = JSON.stringify(initial) !== JSON.stringify(draft)
  const problem = automationMessageProblem(draft.messageTemplate, info.variables)
  const title = saved?.name ?? recipeTitle(info.id, info.title)
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])
  useUnloadGuard(isDirty)

  const save = async () => {
    if (problem) return
    if (isDemo) return void toast.info(DEMO_READONLY)
    setSaving(true)
    const result = await runAction(() => callAutomations<{ id: string; created: boolean }>(actions, tenantId, { action: 'save', automation: toApiDraft(draft) }))
    setSaving(false)
    if (!result) return
    setInitial(draft)
    refresh()
    if (result.created) {
      flow.open({ automationId: result.id, name: title, draft: toApiDraft(draft), runMode: draft.runMode }, 'turn_on', info.id)
      return
    }
    toast.success(saved?.status === 'off' ? 'Saved. It’s still off — turn it on to start sending.' : 'Saved.')
  }

  return (
    <SheetFrame
      title={title}
      description={info.pitch}
      isDirty={isDirty}
      armRequest={armRequest}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {saved?.status === 'on' && !isDirty && (
            <Button type="button" variant="outline" className="min-h-11 rounded-full sm:min-h-9" onClick={() => flow.runNow(saved)}><Send className="h-4 w-4" aria-hidden="true" /> Run now</Button>
          )}
          {saved?.status === 'off' && !isDirty && (
            <Button type="button" variant="outline" className="min-h-11 rounded-full sm:min-h-9" onClick={() => flow.turnOn(saved)}>Turn on</Button>
          )}
          <Button type="button" className="min-h-11 rounded-full px-5 sm:min-h-9" disabled={problem !== null || isSaving || (saved !== null && !isDirty)} onClick={() => void save()}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saved ? 'Save changes' : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-full flex-col lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-xl space-y-8 px-4 py-7 sm:px-8">
            <KnobSentence info={info} draft={draft} onChange={(params) => setDraft({ ...draft, params })} />
            <AutomationMessage info={info} value={draft.messageTemplate} problem={problem} onChange={(messageTemplate) => setDraft({ ...draft, messageTemplate })} />
            <section aria-labelledby="automation-run-mode" className="space-y-3">
              <h3 id="automation-run-mode" className="text-[15px] font-semibold tracking-tight">How it runs</h3>
              <RadioChips label="How it runs" size="card" className="grid grid-cols-2" options={RUN_MODE_OPTIONS} value={draft.runMode} onChange={(runMode) => setDraft({ ...draft, runMode })} />
            </section>
          </div>
        </div>
        <aside aria-label="What guests see" className="border-t border-wn-line bg-wn-sand px-6 py-8 lg:w-[380px] lg:shrink-0 lg:border-l lg:border-t-0">
          <div className="space-y-3 lg:sticky lg:top-8">
            <p className="text-center text-xs text-wn-stone">What guests see, with a sample guest</p>
            <PhonePreview template={draft.messageTemplate} samples={[]} stamp="Today 10:00 AM" body={renderAutomationSample(draft.messageTemplate, storeName, tenantSlug)} />
          </div>
        </aside>
      </div>
    </SheetFrame>
  )
}
