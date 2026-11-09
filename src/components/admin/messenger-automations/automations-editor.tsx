'use client'

import { useMemo, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { saveMessengerAutomationsAction } from '@/app/actions/messenger-automations'
import { ruleSetProblems, type MessengerRule, type TriggerKind } from '@/lib/messenger/rules'
import { ACTION_LABELS, describeTrigger, moveRule, newDraftRule, TAKEOVER_OPTIONS } from '@/lib/messenger/rule-labels'
import type { ReplyStore } from '@/lib/messenger/store-view'
import { FIELD_CLASS } from './field-styles'
import { RuleEditorSheet } from './rule-editor-sheet'
import { TesterPanel } from './tester-panel'

export interface AutomationsEditorProps {
  tenantId: string
  initialRules: MessengerRule[]
  /** False = the store still runs the built-in rules (shown as such until the first save). */
  isCustomized: boolean
  version: number
  botEnabled: boolean
  takeoverMinutes: number
  store: ReplyStore
  isPageConnected: boolean
  isTesterLinked: boolean
  profileError: string | null
}

const ONCE_ONLY: readonly TriggerKind[] = ['get_started', 'fallback']

export function AutomationsEditor(props: AutomationsEditorProps) {
  const [rules, setRules] = useState<MessengerRule[]>(props.initialRules)
  const [botEnabled, setBotEnabled] = useState(props.botEnabled)
  const [takeoverMinutes, setTakeoverMinutes] = useState(props.takeoverMinutes)
  const [version, setVersion] = useState(props.version)
  const [isCustomized, setIsCustomized] = useState(props.isCustomized)
  const [isDirty, setIsDirty] = useState(false)
  const [editing, setEditing] = useState<MessengerRule | null>(null)
  const [isTesterLinked, setIsTesterLinked] = useState(props.isTesterLinked)
  const [profileError, setProfileError] = useState(props.profileError)
  const [isSaving, startSaving] = useTransition()

  const change = (next: MessengerRule[]) => { setRules(next); setIsDirty(true) }
  const problems = useMemo(() => ruleSetProblems(rules), [rules])
  const takenKinds = useMemo(() => new Set(
    rules.filter((rule) => rule.id !== editing?.id && ONCE_ONLY.includes(rule.trigger.kind)).map((rule) => rule.trigger.kind),
  ), [rules, editing])

  const finishEdit = (rule: MessengerRule) => {
    const exists = rules.some((entry) => entry.id === rule.id)
    change(exists ? rules.map((entry) => (entry.id === rule.id ? rule : entry)) : [...rules, rule])
    setEditing(null)
  }

  const save = () => startSaving(async () => {
    const result = await saveMessengerAutomationsAction({ tenantId: props.tenantId, expectedVersion: version, rules, botEnabled, takeoverMinutes })
    if (!result.ok) { toast.error(result.error); return }
    setRules(result.rules)
    setVersion(result.version)
    setIsCustomized(true)
    setIsDirty(false)
    setProfileError(result.profileError ?? null)
    if (result.profileError) toast.warning(result.profileError)
    else toast.success('Messenger automations saved')
  })

  return (
    <div className="space-y-6">
      {!props.isPageConnected ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-900">Connect your Facebook Page on the Messenger settings page first. You can set these up now; they start answering once the Page is connected.</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Auto-replies</CardTitle>
          <CardDescription>The bot answers in your Page’s chat. The first automation that fits a message wins, so put the most specific ones on top.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <span>
              <span className="block font-medium">Auto-replies on</span>
              <span className="block text-sm text-muted-foreground">Off = the bot never answers. Order summaries from checkout still send.</span>
            </span>
            <Switch checked={botEnabled} onCheckedChange={(checked) => { setBotEnabled(checked); setIsDirty(true) }} />
          </label>
          <div className="space-y-1.5 rounded-lg border p-4">
            <label htmlFor="takeover" className="block font-medium">When you reply yourself</label>
            <p className="text-sm text-muted-foreground">A reply from you or your staff in Page Inbox pauses the bot for that customer, so you don’t talk over each other.</p>
            <select id="takeover" className={FIELD_CLASS} value={takeoverMinutes} onChange={(event) => { setTakeoverMinutes(Number(event.target.value)); setIsDirty(true) }}>
              {TAKEOVER_OPTIONS.map((option) => (
                <option key={option.minutes} value={option.minutes}>{option.minutes === 0 ? option.label : `Pause the bot for ${option.label}`}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Type /menu, /categories or /hours in Page Inbox to send that card without pausing.</p>
          </div>

          {!isCustomized ? <p className="text-sm text-muted-foreground">These are the built-in automations. Change anything and save to make them yours.</p> : null}

          <ol className="space-y-2">
            {rules.map((rule, index) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 sm:flex-nowrap">
                <Switch aria-label={`${rule.name} on`} checked={rule.isEnabled} onCheckedChange={(checked) => change(rules.map((entry) => (entry.id === rule.id ? { ...entry, isEnabled: checked } : entry)))} />
                <button type="button" className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setEditing(rule)}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{rule.name}</span>
                    <Badge variant="secondary">{ACTION_LABELS[rule.action.kind].title}</Badge>
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">{describeTrigger(rule.trigger)}</span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move ${rule.name} up`} disabled={index === 0} onClick={() => change(moveRule(rules, index, -1))}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move ${rule.name} down`} disabled={index === rules.length - 1} onClick={() => change(moveRule(rules, index, 1))}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${rule.name}`} onClick={() => setEditing(rule)}><Pencil className="h-4 w-4" aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${rule.name}`} onClick={() => change(rules.filter((entry) => entry.id !== rule.id))}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                </div>
              </li>
            ))}
            {rules.length === 0 ? <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No automations. The bot won’t answer anything.</li> : null}
          </ol>

          <Button type="button" variant="outline" onClick={() => setEditing(newDraftRule('keyword', 'menu_card', props.store.categories[0]?.id ?? null))}>
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Add automation
          </Button>
        </CardContent>
      </Card>

      <TesterPanel tenantId={props.tenantId} isLinked={isTesterLinked} onLinkedChange={setIsTesterLinked} />

      {profileError ? <p className="text-sm text-destructive" role="alert">{profileError}</p> : null}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-end sm:rounded-lg sm:border">
        {problems.length > 0 ? <p className="text-sm text-destructive sm:mr-auto">{problems[0]}</p> : null}
        {isDirty && problems.length === 0 ? <p className="text-sm text-muted-foreground sm:mr-auto">You have unsaved changes.</p> : null}
        <Button type="button" disabled={!isDirty || isSaving || problems.length > 0} onClick={save}>{isSaving ? 'Saving…' : 'Save'}</Button>
      </div>

      <RuleEditorSheet
        tenantId={props.tenantId}
        rule={editing}
        store={props.store}
        takenKinds={takenKinds}
        isTesterLinked={isTesterLinked}
        onClose={() => setEditing(null)}
        onDone={finishEdit}
      />
    </div>
  )
}
