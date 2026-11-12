'use client'

/**
 * Messenger Studio (plan docs/plans/2026-11-11-messenger-studio-and-chat-inbox.md, A1):
 * the full-screen editor for everything the Page's chat does by itself.
 * Built from the Branding Studio's own frame (top bar, icon rail, settings
 * panel / phone bottom sheet, dotted canvas) so it reads as the same tool.
 *
 * Edits stay local until Save: rules + bot settings go through
 * `save_messenger_rules` (one transaction, version check), wording + status
 * switches through `saveMessengerMessagesAction`.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { saveMessengerAutomationsAction, saveMessengerMessagesAction } from '@/app/actions/messenger-automations'
import type { SimEnv } from '@/lib/messenger/chat-simulator'
import type { JourneyStepId } from '@/lib/messenger/journey'
import { MESSAGE_BY_ID, type MessageMoment, type MessageSettings } from '@/lib/messenger/messages/registry'
import { toStoredMessages } from '@/lib/messenger/messages/stored'
import type { OrderUpdatesConfig } from '@/lib/messenger/order-view'
import { buildReply } from '@/lib/messenger/replies'
import { newDraftRule, onceSlot } from '@/lib/messenger/rule-labels'
import { pickOnceRule, ruleSetProblems, triggerWhen, type MessengerRule, type TriggerKind } from '@/lib/messenger/rules'
import { messageTurns, momentTurns, PREVIEW_MOMENT_LABELS, type PreviewMoment, type Turn } from '@/lib/messenger/studio-scenarios'
import { SettingsSheet, SurfaceRail, previewInsetFor, type RailItem, type SheetSize } from '@/components/admin/branding-studio/studio-shell'
import { RuleEditorSheet } from '@/components/admin/messenger-automations/rule-editor-sheet'
import { JourneyPanel } from './journey-panel'
import { MessagesPanel } from './messages-panel'
import { RulesPanel } from './rules-panel'
import { SettingsPanel } from './settings-panel'
import { StudioCanvas, type CanvasMode } from './studio-canvas'
import type { MessengerStudioProps } from '@/lib/messenger/studio-props'

export type { MessengerStudioProps }

type TabId = 'journey' | 'rules' | 'messages' | 'settings'

const TABS: ReadonlyArray<RailItem<TabId>> = [
  { id: 'journey', glyph: 'J', label: 'Journey' },
  { id: 'rules', glyph: 'A', label: 'Auto-replies' },
  { id: 'messages', glyph: 'M', label: 'Messages' },
  { id: 'settings', glyph: 'S', label: 'Settings & test' },
]

const ONCE_ONLY: readonly TriggerKind[] = ['get_started', 'fallback']
const SAMPLE_NAME = 'Ana'

const MOMENT_FOR_MESSAGES: Record<MessageMoment, PreviewMoment> = { browsing: 'browsing', cart: 'cart', after: 'after', handover: 'handover' }

interface Saved {
  rules: MessengerRule[]
  botEnabled: boolean
  takeoverMinutes: number
  messages: MessageSettings
  orderUpdates: OrderUpdatesConfig
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** How many things differ from what is stored ("3 changes"). */
function countChanges(saved: Saved, draft: Saved): { rules: number; words: number } {
  const savedById = new Map(saved.rules.map((rule) => [rule.id, rule]))
  const draftIds = new Set(draft.rules.map((rule) => rule.id))
  let rules = draft.rules.filter((rule) => !same(savedById.get(rule.id), rule)).length
  rules += saved.rules.filter((rule) => !draftIds.has(rule.id)).length
  if (rules === 0 && !same(saved.rules.map((rule) => rule.id), draft.rules.map((rule) => rule.id))) rules = 1
  if (saved.botEnabled !== draft.botEnabled) rules += 1
  if (saved.takeoverMinutes !== draft.takeoverMinutes) rules += 1

  const textIds = new Set([...Object.keys(saved.messages.texts), ...Object.keys(draft.messages.texts)])
  const toggleIds = new Set([...Object.keys(saved.messages.toggles), ...Object.keys(draft.messages.toggles)])
  let words = [...textIds].filter((id) => (saved.messages.texts as Record<string, string>)[id] !== (draft.messages.texts as Record<string, string>)[id]).length
  words += [...toggleIds].filter((id) => (saved.messages.toggles as Record<string, boolean>)[id] !== (draft.messages.toggles as Record<string, boolean>)[id]).length
  if (saved.messages.lang !== draft.messages.lang) words += 1
  if (saved.orderUpdates.enabled !== draft.orderUpdates.enabled) words += 1
  if (!same(saved.orderUpdates.statuses, draft.orderUpdates.statuses)) words += 1
  return { rules, words }
}

export function MessengerStudio(props: MessengerStudioProps) {
  const [saved, setSaved] = useState<Saved>({
    rules: props.initialRules, botEnabled: props.botEnabled, takeoverMinutes: props.takeoverMinutes, messages: props.messages, orderUpdates: props.orderUpdates,
  })
  const [rules, setRules] = useState(props.initialRules)
  const [botEnabled, setBotEnabled] = useState(props.botEnabled)
  const [takeoverMinutes, setTakeoverMinutes] = useState(props.takeoverMinutes)
  const [messages, setMessages] = useState(props.messages)
  const [orderUpdates, setOrderUpdates] = useState(props.orderUpdates)
  const [version, setVersion] = useState(props.version)
  const [isCustomized, setIsCustomized] = useState(props.isCustomized)
  const [isTesterLinked, setIsTesterLinked] = useState(props.isTesterLinked)
  const [profileError, setProfileError] = useState(props.profileError)
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({})

  const [tab, setTab] = useState<TabId>('journey')
  const [sheetSize, setSheetSize] = useState<SheetSize>('half')
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('preview')
  const [moment, setMoment] = useState<PreviewMoment>('hello')
  const [journeyStep, setJourneyStep] = useState<JourneyStepId | null>('hello')
  const [messageMoment, setMessageMoment] = useState<MessageMoment>('cart')
  const [openMessageId, setOpenMessageId] = useState<string | null>(null)
  const [editing, setEditing] = useState<MessengerRule | null>(null)
  const [answeredRuleId, setAnsweredRuleId] = useState<string | null>(null)
  // "Only when" automations: the preview and Test chat start from the store's hours now.
  const [storeOpen, setStoreOpen] = useState(props.store.isOpenNow ?? true)
  const [isSaving, startSaving] = useTransition()

  const draft: Saved = { rules, botEnabled, takeoverMinutes, messages, orderUpdates }
  const changes = countChanges(saved, draft)
  const changeCount = changes.rules + changes.words
  const ruleProblems = useMemo(() => ruleSetProblems(rules), [rules])

  useEffect(() => {
    if (changeCount === 0) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changeCount])

  const takenSlots = useMemo(() => new Set(
    rules
      .filter((rule) => rule.id !== editing?.id && ONCE_ONLY.includes(rule.trigger.kind))
      .map((rule) => onceSlot(rule.trigger.kind, triggerWhen(rule.trigger))),
  ), [rules, editing])
  const usesHours = rules.some((rule) => rule.isEnabled && triggerWhen(rule.trigger) !== null)

  // What the phone shows in Preview: the message being edited, else the moment.
  const preview = useMemo((): { turns: Turn[]; caption: string; moment: PreviewMoment | null } => {
    const input = { store: props.store, rules, messages, customerName: SAMPLE_NAME, isOpen: storeOpen }
    if (tab === 'messages' && openMessageId && MESSAGE_BY_ID.has(openMessageId)) {
      return { turns: messageTurns(openMessageId, input), caption: `Sample customer “${SAMPLE_NAME}” · showing “${MESSAGE_BY_ID.get(openMessageId)?.label}”`, moment: null }
    }
    if (tab === 'journey' && journeyStep === 'fallback') {
      const fallback = pickOnceRule(rules, 'fallback', storeOpen)
      const turns: Turn[] = [{ from: 'customer', text: 'asdfgh?' }]
      turns.push(fallback
        ? { from: 'bot', messages: buildReply(fallback.action, { store: props.store, linkToken: null, messages, customerName: SAMPLE_NAME }) }
        : { from: 'note', text: 'No answer. Set up a “didn’t understand” reply.' })
      return { turns, caption: 'A message no automation fits', moment: null }
    }
    return { turns: momentTurns(moment, input), caption: `Sample customer “${SAMPLE_NAME}” · ${PREVIEW_MOMENT_LABELS[moment]}`, moment }
  }, [tab, openMessageId, journeyStep, moment, rules, messages, props.store, storeOpen])

  const simEnv: SimEnv = { store: props.store, rules, messages, botEnabled, customerName: SAMPLE_NAME, isOpen: storeOpen }

  const showMoment = (next: PreviewMoment) => {
    setMoment(next)
    setCanvasMode('preview')
    if (tab === 'journey') setJourneyStep(next)
    if (tab === 'messages' && next !== 'hello') { setMessageMoment(next as MessageMoment); setOpenMessageId(null) }
  }

  const editRule = (rule: MessengerRule) => setEditing(rule)
  const finishEdit = (rule: MessengerRule) => {
    setRules((current) => (current.some((entry) => entry.id === rule.id) ? current.map((entry) => (entry.id === rule.id ? rule : entry)) : [...current, rule]))
    setEditing(null)
  }

  const onJourneyEdit = (step: JourneyStepId) => {
    switch (step) {
      case 'hello': {
        const rule = rules.find((entry) => entry.trigger.kind === 'get_started')
        editRule(rule ?? { ...newDraftRule('get_started', 'menu_card'), name: 'Get Started' })
        return
      }
      case 'fallback': {
        const rule = rules.find((entry) => entry.trigger.kind === 'fallback')
        editRule(rule ?? { ...newDraftRule('fallback', 'categories', props.store.categories[0]?.id ?? null), name: 'Didn’t understand' })
        return
      }
      case 'handover':
        setTab('settings')
        return
      default:
        setTab('messages')
        setMessageMoment(step)
        setOpenMessageId(null)
        setMoment(MOMENT_FOR_MESSAGES[step])
    }
  }

  const save = () => startSaving(async () => {
    setServerProblems({})
    const latest = { ...saved }
    if (changes.words > 0) {
      const result = await saveMessengerMessagesAction({ tenantId: props.tenantId, messages: toStoredMessages(messages), orderUpdates })
      if (!result.ok) {
        if ('problems' in result) setServerProblems(Object.fromEntries(result.problems.map((problem) => [problem.id, problem.message])))
        setTab('messages')
        toast.error(result.error)
        return
      }
      setMessages(result.messages)
      setOrderUpdates(result.orderUpdates)
      latest.messages = result.messages
      latest.orderUpdates = result.orderUpdates
      setSaved({ ...latest })
    }
    if (changes.rules > 0) {
      const result = await saveMessengerAutomationsAction({ tenantId: props.tenantId, expectedVersion: version, rules, botEnabled, takeoverMinutes })
      if (!result.ok) { toast.error(result.error); return }
      setRules(result.rules)
      setVersion(result.version)
      setIsCustomized(true)
      setProfileError(result.profileError ?? null)
      setSaved({ ...latest, rules: result.rules, botEnabled, takeoverMinutes })
      if (result.profileError) { toast.warning(result.profileError); return }
    }
    toast.success('Saved. Your Page’s chat uses it now.')
  })

  const settingsHref = `/${props.tenantSlug}/admin/settings/messenger`
  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#EFECE6] font-sans text-[#1D1815]">
      {/* ============ TOP BAR ============ */}
      <div className="z-20 flex h-[54px] flex-shrink-0 items-center gap-2 border-b border-[#E5E0D6] bg-white px-2 md:gap-4 md:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href={settingsHref} className="flex h-[26px] items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[12px] font-bold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Back to Messenger settings">
            ← Messenger
          </Link>
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-[#1D1815] text-[13px] font-black text-white max-md:hidden">M</div>
          <h1 className="text-[14px] font-extrabold max-md:hidden">Messenger Studio</h1>
          <div className="truncate border-l border-[#E5E0D6] pl-3 text-[12px] font-semibold text-[#8B857B] max-lg:hidden">
            {props.store.name} · {props.isPageConnected ? 'Page connected' : 'Page not connected'}
          </div>
        </div>
        <div className="flex-1" />
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold max-sm:hidden ${botEnabled ? 'bg-[#E7F3EE] text-[#065F46]' : 'bg-neutral-100 text-neutral-500'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${botEnabled ? 'bg-emerald-600' : 'bg-neutral-400'}`} aria-hidden />
          {botEnabled ? 'Bot is answering' : 'Bot is off'}
        </span>
        {changeCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#B23E1B]">
            <span className="h-2 w-2 rounded-full bg-[#E4572E]" aria-hidden />
            {changeCount} change{changeCount === 1 ? '' : 's'}
          </span>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={isSaving || changeCount === 0 || ruleProblems.length > 0}
          title={ruleProblems[0]}
          className="whitespace-nowrap rounded-full bg-[#1D1815] px-4 py-2 text-[13px] font-extrabold text-white transition-opacity hover:opacity-85 disabled:opacity-40 md:px-5"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <SurfaceRail surfaces={TABS} activeId={tab} onPick={(next) => { setTab(next); setCanvasMode(next === 'settings' ? 'test' : 'preview') }} />

        <SettingsSheet size={sheetSize} onSizeChange={setSheetSize} title={activeTab.label}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'journey' ? (
              <JourneyPanel
                rules={rules}
                orderUpdates={orderUpdates}
                takeoverMinutes={takeoverMinutes}
                isPlatformOrders={props.isPlatformOrders}
                activeStep={journeyStep}
                onShow={(step) => {
                  setJourneyStep(step)
                  setCanvasMode('preview')
                  if (step !== 'fallback') setMoment(step)
                }}
                onEdit={onJourneyEdit}
                onStatusMessagesChange={(enabled) => setOrderUpdates({ ...orderUpdates, enabled })}
              />
            ) : null}
            {tab === 'rules' ? (
              <RulesPanel
                rules={rules}
                isCustomized={isCustomized}
                firstCategoryId={props.store.categories[0]?.id ?? null}
                answeredRuleId={answeredRuleId}
                problem={ruleProblems[0] ?? null}
                onChange={setRules}
                onEdit={editRule}
              />
            ) : null}
            {tab === 'messages' ? (
              <MessagesPanel
                messages={messages}
                orderUpdates={orderUpdates}
                isPlatformOrders={props.isPlatformOrders}
                moment={messageMoment}
                openId={openMessageId}
                serverProblems={serverProblems}
                onMomentChange={(next) => { setMessageMoment(next); setMoment(MOMENT_FOR_MESSAGES[next]); setCanvasMode('preview') }}
                onOpen={(id) => { setOpenMessageId(id); setCanvasMode('preview') }}
                onChange={(next) => { setMessages(next); setServerProblems({}) }}
                onOrderUpdatesChange={setOrderUpdates}
              />
            ) : null}
            {tab === 'settings' ? (
              <SettingsPanel
                tenantId={props.tenantId}
                messengerSettingsHref={settingsHref}
                botEnabled={botEnabled}
                takeoverMinutes={takeoverMinutes}
                isPageConnected={props.isPageConnected}
                isTesterLinked={isTesterLinked}
                profileError={profileError}
                onBotEnabledChange={setBotEnabled}
                onTakeoverChange={setTakeoverMinutes}
                onTesterLinkedChange={setIsTesterLinked}
              />
            ) : null}
            <div className="h-8" />
          </div>
        </SettingsSheet>

        <StudioCanvas
          mode={canvasMode}
          onModeChange={setCanvasMode}
          moment={preview.moment}
          onMomentChange={showMoment}
          previewTurns={preview.turns}
          caption={preview.caption}
          env={simEnv}
          insetClass={previewInsetFor(sheetSize)}
          onAnswered={(ruleId) => setAnsweredRuleId(ruleId)}
          storeOpen={usesHours ? { isOpen: storeOpen, onChange: setStoreOpen } : undefined}
        />
      </div>

      <RuleEditorSheet
        tenantId={props.tenantId}
        rule={editing}
        store={props.store}
        takenSlots={takenSlots}
        isTesterLinked={isTesterLinked}
        messages={messages}
        onClose={() => setEditing(null)}
        onDone={finishEdit}
      />
    </div>
  )
}
