'use client'

import { useMemo, useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { sendMessengerTestAction } from '@/app/actions/messenger-automations'
import { buildReply, withPreviewData } from '@/lib/messenger/replies'
import { ruleSchema, type MessengerRule } from '@/lib/messenger/rules'
import { TRIGGER_LABELS } from '@/lib/messenger/rule-labels'
import type { ReplyStore } from '@/lib/messenger/store-view'
import { ActionFields } from './action-fields'
import { MessengerPreview } from './messenger-preview'
import { TriggerFields } from './trigger-fields'
import type { MessageSettings } from '@/lib/messenger/messages/registry'

interface RuleEditorSheetProps {
  tenantId: string
  rule: MessengerRule | null
  store: ReplyStore
  /** Get Started / fallback slots another rule already uses (`onceSlot`). */
  takenSlots: ReadonlySet<string>
  isTesterLinked: boolean
  /** The store's draft wording, so the preview shows what would go out. */
  messages?: MessageSettings
  onClose: () => void
  onDone: (rule: MessengerRule) => void
}

function customerLine(rule: MessengerRule): string {
  switch (rule.trigger.kind) {
    case 'keyword':
      return rule.trigger.keywords[0] ?? ''
    case 'ice_breaker':
      return rule.trigger.question
    case 'menu_button':
      return rule.trigger.label
    case 'get_started':
      return 'Get Started'
    case 'fallback':
      return 'Hello?'
  }
}

/** Why a draft can't be kept yet, in the owner's words (null = it can). */
function draftProblem(rule: MessengerRule): string | null {
  if (rule.trigger.kind === 'keyword' && rule.trigger.keywords.length === 0) return 'Add at least one word.'
  if (rule.trigger.kind === 'ice_breaker' && !rule.trigger.question.trim()) return 'Write the question.'
  if (rule.trigger.kind === 'menu_button' && !rule.trigger.label.trim()) return 'Name the button.'
  if (rule.action.kind === 'text' && !rule.action.text.trim()) return 'Write your message.'
  if (rule.action.kind === 'category_items' && !rule.action.categoryId) return 'Pick a category.'
  if (rule.action.kind === 'text' && rule.action.buttons.some((button) => !button.label.trim())) return 'Every button needs a label.'
  return ruleSchema.safeParse(rule).success ? null : 'Check the highlighted fields (links must start with https://).'
}

function EditorBody({ tenantId, rule: initial, store, takenSlots, isTesterLinked, messages, onClose, onDone }: RuleEditorSheetProps & { rule: MessengerRule }) {
  const [rule, setRule] = useState<MessengerRule>(initial)
  const [isSending, startSending] = useTransition()
  const preview = useMemo(() => buildReply(rule.action, withPreviewData({ store, linkToken: null, messages, customerName: 'Ana' })), [rule.action, store, messages])
  const problem = draftProblem({ ...rule, name: rule.name.trim() || 'Automation' })

  const sendTest = () => startSending(async () => {
    const result = await sendMessengerTestAction(tenantId, rule.action)
    if (result.ok) toast.success('Sent to your Messenger')
    else toast.error(result.error)
  })

  return (
    <>
      <SheetHeader>
        <SheetTitle>{initial.id.startsWith('draft-') ? 'New automation' : 'Edit automation'}</SheetTitle>
        <SheetDescription>{TRIGGER_LABELS[rule.trigger.kind].help}</SheetDescription>
      </SheetHeader>

      <div className="grid gap-6 px-4 pb-4 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Name (only you see it)</Label>
            <Input id="rule-name" value={rule.name} maxLength={60} onChange={(event) => setRule({ ...rule, name: event.target.value })} />
          </div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">When</p>
          <TriggerFields trigger={rule.trigger} takenSlots={takenSlots} onChange={(trigger) => setRule({ ...rule, trigger })} />
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">Then the bot sends</p>
          <ActionFields action={rule.action} store={store} onChange={(action) => setRule({ ...rule, action })} />
        </div>
        <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
          <p className="text-sm font-semibold">Preview</p>
          <MessengerPreview customerLine={customerLine(rule)} messages={preview} storeName={store.name} />
          <Button type="button" variant="outline" className="w-full" disabled={!isTesterLinked || isSending || problem !== null} onClick={sendTest}>
            <Send className="mr-2 h-4 w-4" aria-hidden />
            {isSending ? 'Sending…' : 'Send test to my Messenger'}
          </Button>
          {!isTesterLinked ? <p className="text-xs text-muted-foreground">Link your Messenger under Settings &amp; test to send yourself a test.</p> : null}
        </div>
      </div>

      <SheetFooter className="border-t sm:flex-row sm:justify-end">
        {problem ? <p className="text-sm text-destructive sm:mr-auto sm:self-center" role="status">{problem}</p> : null}
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={problem !== null} onClick={() => onDone({ ...rule, name: rule.name.trim() || 'Automation' })}>Done</Button>
      </SheetFooter>
    </>
  )
}

/** One automation: when → reply with, wording, live preview. Edits stay local until the page's Save. */
export function RuleEditorSheet(props: RuleEditorSheetProps) {
  return (
    <Sheet open={props.rule !== null} onOpenChange={(open) => { if (!open) props.onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        {props.rule ? <EditorBody key={props.rule.id} {...props} rule={props.rule} /> : null}
      </SheetContent>
    </Sheet>
  )
}
